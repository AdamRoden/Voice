# Convert Vertanen forum ARPA → data/mobile-lm.json.gz
# Source: https://digitalcommons.mtu.edu/mobiletext/3/  (Forum, 20k, 4-gram, small)
#
# Usage:
#   1. Download "Forum, 20k, 4-gram, small" and gunzip to:
#        data/lm_forum_20k_4gram_small.arpa
#   2. Run:
#        powershell -File tools/convert-arpa-mobile-lm.ps1
#
param(
  [string]$ArpaPath = (Join-Path $PSScriptRoot "..\data\lm_forum_20k_4gram_small.arpa"),
  [string]$OutJson = (Join-Path $PSScriptRoot "..\data\mobile-lm.json"),
  [string]$OutGz = (Join-Path $PSScriptRoot "..\data\mobile-lm.json.gz"),
  [int]$TopK2 = 32,
  [int]$TopK3 = 20,
  [int]$TopK4 = 12,
  [int]$MaxCtx3 = 120000,
  [int]$MaxCtx4 = 80000
)

$ErrorActionPreference = "Stop"
$ArpaPath = [IO.Path]::GetFullPath($ArpaPath)
$OutJson = [IO.Path]::GetFullPath($OutJson)
$OutGz = [IO.Path]::GetFullPath($OutGz)

if (-not (Test-Path $ArpaPath)) {
  throw @"
ARPA not found: $ArpaPath

Download filename=12 from https://digitalcommons.mtu.edu/mobiletext/3/
(Forum, 20k, 4-gram, small), place as data/lm_forum_20k_4gram_small.arpa.gz,
then:  gzip -d data/lm_forum_20k_4gram_small.arpa.gz
"@
}

Write-Host "ARPA: $ArpaPath"
Write-Host "Out:  $OutGz"

$code = @"
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Text;

public static class ArpaConvert {
  public static int TopK2, TopK3, TopK4, MaxCtx3, MaxCtx4;

  struct Cont {
    public int Id;
    public float LogP;
    public Cont(int id, float logp) { Id = id; LogP = logp; }
  }

  static string JStr(string s) {
    var sb = new StringBuilder(s.Length + 2);
    sb.Append('"');
    foreach (char c in s) {
      if (c == '"' || c == '\\') { sb.Append('\\'); sb.Append(c); }
      else if (c == '\n') sb.Append("\\n");
      else if (c == '\r') sb.Append("\\r");
      else if (c == '\t') sb.Append("\\t");
      else sb.Append(c);
    }
    sb.Append('"');
    return sb.ToString();
  }

  public static void Run(string arpaPath, string jsonPath, string gzPath) {
    var inv = new Dictionary<string,int>(StringComparer.Ordinal);
    var vocab = new List<string>();
    var uniLog = new List<float>();
    var uniBow = new List<float>();
    int idS = -1, idEos = -1;

    int section = 0;
    foreach (var raw in File.ReadLines(arpaPath)) {
      var line = raw.Trim();
      if (line.Length == 0) continue;
      if (line.StartsWith("\\1-grams:")) { section = 1; continue; }
      if (line.StartsWith("\\2-grams:")) { section = 2; break; }
      if (section != 1) continue;
      var parts = line.Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
      if (parts.Length < 2) continue;
      float logp = float.Parse(parts[0], CultureInfo.InvariantCulture);
      string w = parts[1];
      float bow = parts.Length >= 3 ? float.Parse(parts[2], CultureInfo.InvariantCulture) : 0f;
      inv[w] = vocab.Count;
      vocab.Add(w);
      uniLog.Add(logp);
      uniBow.Add(bow);
      if (w == "<s>") idS = inv[w];
      else if (w == "</s>") idEos = inv[w];
    }
    Console.WriteLine("vocab=" + vocab.Count);

    var bi = new Dictionary<int, List<Cont>>();
    var tri = new Dictionary<long, List<Cont>>();
    var four = new Dictionary<string, List<Cont>>();

    section = 0;
    foreach (var raw in File.ReadLines(arpaPath)) {
      var line = raw.Trim();
      if (line.Length == 0) continue;
      if (line.StartsWith("\\2-grams:")) { section = 2; continue; }
      if (line.StartsWith("\\3-grams:")) { section = 3; continue; }
      if (line.StartsWith("\\4-grams:")) { section = 4; continue; }
      if (line.StartsWith("\\end\\")) break;
      if (section < 2) continue;
      var parts = line.Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
      if (parts.Length < 3) continue;
      float logp = float.Parse(parts[0], CultureInfo.InvariantCulture);

      if (section == 2) {
        int w1, w2;
        if (!inv.TryGetValue(parts[1], out w1) || !inv.TryGetValue(parts[2], out w2)) continue;
        if (w2 == idEos) continue;
        List<Cont> list;
        if (!bi.TryGetValue(w1, out list)) { list = new List<Cont>(8); bi[w1] = list; }
        list.Add(new Cont(w2, logp));
      } else if (section == 3) {
        int w1, w2, w3;
        if (!inv.TryGetValue(parts[1], out w1) || !inv.TryGetValue(parts[2], out w2) || !inv.TryGetValue(parts[3], out w3)) continue;
        if (w3 == idEos) continue;
        long key = ((long)w1 << 16) | (ushort)w2;
        List<Cont> list;
        if (!tri.TryGetValue(key, out list)) { list = new List<Cont>(4); tri[key] = list; }
        list.Add(new Cont(w3, logp));
      } else if (section == 4) {
        int w1, w2, w3, w4;
        if (!inv.TryGetValue(parts[1], out w1) || !inv.TryGetValue(parts[2], out w2) ||
            !inv.TryGetValue(parts[3], out w3) || !inv.TryGetValue(parts[4], out w4)) continue;
        if (w4 == idEos) continue;
        string key = w1 + "," + w2 + "," + w3;
        List<Cont> list;
        if (!four.TryGetValue(key, out list)) { list = new List<Cont>(4); four[key] = list; }
        list.Add(new Cont(w4, logp));
      }
    }
    Console.WriteLine("ctx2=" + bi.Count + " ctx3=" + tri.Count + " ctx4=" + four.Count);

    Comparison<Cont> cmp = (a, b) => b.LogP.CompareTo(a.LogP);
    Action<List<Cont>, int> prune = (list, k) => {
      list.Sort(cmp);
      if (list.Count > k) list.RemoveRange(k, list.Count - k);
    };
    foreach (var kv in bi) prune(kv.Value, TopK2);
    foreach (var kv in new List<KeyValuePair<long, List<Cont>>>(tri)) prune(kv.Value, TopK3);
    if (tri.Count > MaxCtx3) {
      var ranked = new List<KeyValuePair<long, List<Cont>>>(tri);
      ranked.Sort((a, b) => b.Value[0].LogP.CompareTo(a.Value[0].LogP));
      tri = new Dictionary<long, List<Cont>>(MaxCtx3);
      for (int i = 0; i < MaxCtx3; i++) tri[ranked[i].Key] = ranked[i].Value;
    }
    foreach (var kv in new List<KeyValuePair<string, List<Cont>>>(four)) prune(kv.Value, TopK4);
    if (four.Count > MaxCtx4) {
      var ranked = new List<KeyValuePair<string, List<Cont>>>(four);
      ranked.Sort((a, b) => b.Value[0].LogP.CompareTo(a.Value[0].LogP));
      four = new Dictionary<string, List<Cont>>(MaxCtx4);
      for (int i = 0; i < MaxCtx4; i++) four[ranked[i].Key] = ranked[i].Value;
    }

    var usable = new List<int>();
    var oldToNew = new int[vocab.Count];
    for (int i = 0; i < oldToNew.Length; i++) oldToNew[i] = -1;
    for (int i = 0; i < vocab.Count; i++) {
      var w = vocab[i];
      if (w.Length == 0 || (w[0] == '<' && w[w.Length - 1] == '>')) continue;
      bool ok = true;
      foreach (char c in w) {
        if (!((c >= 'a' && c <= 'z') || c == '\'')) { ok = false; break; }
      }
      if (ok) usable.Add(i);
    }
    usable.Sort((a, b) => uniLog[b].CompareTo(uniLog[a]));
    var words = new List<string>(usable.Count);
    var uArr = new List<int[]>(usable.Count);
    for (int i = 0; i < usable.Count; i++) {
      int old = usable[i];
      oldToNew[old] = i;
      words.Add(vocab[old]);
      uArr.Add(new int[] {
        (int)Math.Round(uniLog[old] * 1000.0),
        (int)Math.Round(uniBow[old] * 1000.0)
      });
    }
    Func<int, int> Map = oldId => (oldId >= 0 && oldId < oldToNew.Length) ? oldToNew[oldId] : -1;

    var bObj = new Dictionary<string, string>();
    foreach (var kv in bi) {
      int left = Map(kv.Key);
      if (left < 0 && kv.Key != idS) continue;
      string leftKey = kv.Key == idS ? "<s>" : words[left];
      var sb = new StringBuilder();
      bool first = true;
      foreach (var c in kv.Value) {
        int id = Map(c.Id);
        if (id < 0) continue;
        if (!first) sb.Append(',');
        first = false;
        sb.Append(words[id]);
        sb.Append(':');
        sb.Append(((int)Math.Round(c.LogP * 1000.0)).ToString(CultureInfo.InvariantCulture));
      }
      if (sb.Length > 0) bObj[leftKey] = sb.ToString();
    }

    var tObj = new Dictionary<string, string>();
    foreach (var kv in tri) {
      int w1 = (int)(kv.Key >> 16);
      int w2 = (int)(kv.Key & 0xFFFF);
      int m1 = Map(w1), m2 = Map(w2);
      string k1 = w1 == idS ? "<s>" : (m1 >= 0 ? words[m1] : null);
      if (k1 == null || m2 < 0) continue;
      string key = k1 + " " + words[m2];
      var sb = new StringBuilder();
      bool first = true;
      foreach (var c in kv.Value) {
        int id = Map(c.Id);
        if (id < 0) continue;
        if (!first) sb.Append(',');
        first = false;
        sb.Append(words[id]);
        sb.Append(':');
        sb.Append(((int)Math.Round(c.LogP * 1000.0)).ToString(CultureInfo.InvariantCulture));
      }
      if (sb.Length > 0) tObj[key] = sb.ToString();
    }

    var fObj = new Dictionary<string, string>();
    foreach (var kv in four) {
      var ids = kv.Key.Split(',');
      int w1 = int.Parse(ids[0]), w2 = int.Parse(ids[1]), w3 = int.Parse(ids[2]);
      int m1 = Map(w1), m2 = Map(w2), m3 = Map(w3);
      string k1 = w1 == idS ? "<s>" : (m1 >= 0 ? words[m1] : null);
      if (k1 == null || m2 < 0 || m3 < 0) continue;
      string key = k1 + " " + words[m2] + " " + words[m3];
      var sb = new StringBuilder();
      bool first = true;
      foreach (var c in kv.Value) {
        int id = Map(c.Id);
        if (id < 0) continue;
        if (!first) sb.Append(',');
        first = false;
        sb.Append(words[id]);
        sb.Append(':');
        sb.Append(((int)Math.Round(c.LogP * 1000.0)).ToString(CultureInfo.InvariantCulture));
      }
      if (sb.Length > 0) fObj[key] = sb.ToString();
    }

    Console.WriteLine("export b=" + bObj.Count + " t=" + tObj.Count + " f=" + fObj.Count);

    using (var sw = new StreamWriter(jsonPath, false, new UTF8Encoding(false))) {
      sw.Write("{\"meta\":{");
      sw.Write("\"name\":\"forum_20k_4gram_small\",");
      sw.Write("\"source\":\"Vertanen & Kristensson Mobile Text Dataset (CC BY 4.0)\",");
      sw.Write("\"url\":\"https://digitalcommons.mtu.edu/mobiletext/3/\",");
      sw.Write("\"paper\":\"Mining, Analyzing, and Modeling Text Written on Mobile Devices\",");
      sw.Write("\"order\":4,");
      sw.Write("\"topK\":[" + TopK2 + "," + TopK3 + "," + TopK4 + "]");
      sw.Write("},");
      sw.Write("\"words\":[");
      for (int i = 0; i < words.Count; i++) {
        if (i > 0) sw.Write(',');
        sw.Write(JStr(words[i]));
      }
      sw.Write("],\"uni\":[");
      for (int i = 0; i < uArr.Count; i++) {
        if (i > 0) sw.Write(',');
        sw.Write('['); sw.Write(uArr[i][0]); sw.Write(','); sw.Write(uArr[i][1]); sw.Write(']');
      }
      sw.Write("],");
      Action<string, Dictionary<string, string>> writeMap = (name, map) => {
        sw.Write("\"" + name + "\":{");
        bool first = true;
        foreach (var kv in map) {
          if (!first) sw.Write(',');
          first = false;
          sw.Write(JStr(kv.Key));
          sw.Write(':');
          sw.Write(JStr(kv.Value));
        }
        sw.Write("}");
      };
      writeMap("bi", bObj); sw.Write(',');
      writeMap("tri", tObj); sw.Write(',');
      writeMap("four", fObj);
      sw.Write("}");
    }
    Console.WriteLine("jsonBytes=" + new FileInfo(jsonPath).Length);
    using (var input = File.OpenRead(jsonPath))
    using (var output = File.Create(gzPath))
    using (var gz = new GZipStream(output, CompressionMode.Compress)) {
      input.CopyTo(gz);
    }
    Console.WriteLine("gzBytes=" + new FileInfo(gzPath).Length);
  }
}
"@

Add-Type -TypeDefinition $code -Language CSharp
[ArpaConvert]::TopK2 = $TopK2
[ArpaConvert]::TopK3 = $TopK3
[ArpaConvert]::TopK4 = $TopK4
[ArpaConvert]::MaxCtx3 = $MaxCtx3
[ArpaConvert]::MaxCtx4 = $MaxCtx4
[ArpaConvert]::Run($ArpaPath, $OutJson, $OutGz)
Write-Host "Done. Ship $OutGz (delete intermediate JSON if desired)."
Write-Host "Attribution: data/NOTICE-mobile-lm.txt"
