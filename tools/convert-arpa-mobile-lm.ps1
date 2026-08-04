# Convert Vertanen ARPA (word n-gram) → data/mobile-lm.json.gz
# Sources: https://digitalcommons.mtu.edu/mobiletext/3/  (Forum models, CC BY 4.0)
#
# Usage:
#   # Default: Forum 64k 4-gram small (or path via -ArpaPath)
#   powershell -File tools/convert-arpa-mobile-lm.ps1
#
#   # Explicit large model + denser top-K export:
#   powershell -File tools/convert-arpa-mobile-lm.ps1 `
#     -ArpaPath data/lm_forum_64k_4gram_large.arpa.gz `
#     -MetaName forum_64k_4gram_large `
#     -TopK2 48 -TopK3 32 -TopK4 20 -MaxCtx3 200000 -MaxCtx4 150000
#
param(
  [string]$ArpaPath = (Join-Path $PSScriptRoot "..\data\lm_forum_64k_4gram_large.arpa.gz"),
  [string]$OutJson = (Join-Path $PSScriptRoot "..\data\mobile-lm.json"),
  [string]$OutGz = (Join-Path $PSScriptRoot "..\data\mobile-lm.json.gz"),
  [string]$MetaName = "forum_64k_4gram_large",
  [string]$MetaUrl = "https://digitalcommons.mtu.edu/mobiletext/3/",
  # Prefer common contexts (unigram mass); peaky rare idioms are a quality bug.
  [int]$TopK2 = 40,
  [int]$TopK3 = 28,
  [int]$TopK4 = 16,
  [int]$MaxCtx3 = 180000,
  [int]$MaxCtx4 = 120000
)

$ErrorActionPreference = "Stop"
$ArpaPath = [IO.Path]::GetFullPath($ArpaPath)
$OutJson = [IO.Path]::GetFullPath($OutJson)
$OutGz = [IO.Path]::GetFullPath($OutGz)

if (-not (Test-Path $ArpaPath)) {
  throw @"
ARPA not found: $ArpaPath

Download a Forum model from https://digitalcommons.mtu.edu/mobiletext/3/
Examples:
  Forum, 64k, 4-gram, small  → data/lm_forum_64k_4gram_small.arpa.gz
  Forum, 64k, 4-gram, large  → data/lm_forum_64k_4gram_large.arpa.gz
  Forum, 20k, 4-gram, small  → data/lm_forum_20k_4gram_small.arpa.gz  (legacy)

Then re-run this script with -ArpaPath and -MetaName matching the file.
"@
}

Write-Host "ARPA: $ArpaPath"
Write-Host "Out:  $OutGz"
Write-Host "Meta: $MetaName  topK=[$TopK2,$TopK3,$TopK4] maxCtx3=$MaxCtx3 maxCtx4=$MaxCtx4"

$code = @"
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Text;

public static class ArpaConvert {
  public static int TopK2, TopK3, TopK4, MaxCtx3, MaxCtx4;
  public static string MetaName, MetaUrl;

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

  static Stream OpenReadMaybeGzip(string path) {
    var fs = File.OpenRead(path);
    if (path.EndsWith(".gz", StringComparison.OrdinalIgnoreCase)) {
      return new GZipStream(fs, CompressionMode.Decompress);
    }
    // sniff gzip magic
    int b0 = fs.ReadByte(), b1 = fs.ReadByte();
    fs.Position = 0;
    if (b0 == 0x1f && b1 == 0x8b) {
      return new GZipStream(fs, CompressionMode.Decompress);
    }
    return fs;
  }

  static IEnumerable<string> ReadLines(Stream stream) {
    using (var sr = new StreamReader(stream, Encoding.UTF8, true, 1 << 16, leaveOpen: false)) {
      string line;
      while ((line = sr.ReadLine()) != null) yield return line;
    }
  }

  /** Insert cont sorted by LogP desc; keep at most k. */
  static void AddTopK(List<Cont> list, Cont c, int k) {
    int i = list.Count;
    while (i > 0 && list[i - 1].LogP < c.LogP) i--;
    // if full and not better than worst, skip
    if (list.Count >= k && i == list.Count) return;
    list.Insert(i, c);
    if (list.Count > k) list.RemoveAt(list.Count - 1);
  }

  /**
   * Context importance for MaxCtx: prefer COMMON left contexts (unigram mass),
   * not peaky rare idioms. Sorting by top continuation LogP kept "i chickened→out"
   * and dropped "i want→to" — that broke keyboard prediction.
   * Higher score (less negative) = more important.
   */
  static float UniScore(List<float> uniLog, int id, int idS) {
    if (id == idS) return 0f;
    if (id < 0 || id >= uniLog.Count) return -20f;
    return uniLog[id];
  }

  static float TriCtxScore(long key, List<float> uniLog, int idS) {
    int w1 = (int)(key >> 16);
    int w2 = (int)(key & 0xFFFF);
    return UniScore(uniLog, w1, idS) + UniScore(uniLog, w2, idS);
  }

  static float FourCtxScore(string key, List<float> uniLog, int idS) {
    var ids = key.Split(',');
    float s = 0f;
    for (int i = 0; i < ids.Length; i++) {
      int id;
      if (!int.TryParse(ids[i], out id)) return -60f;
      s += UniScore(uniLog, id, idS);
    }
    return s;
  }

  static void PruneTriByUni(Dictionary<long, List<Cont>> map, int maxCtx, List<float> uniLog, int idS) {
    if (map.Count <= maxCtx) return;
    var ranked = new List<KeyValuePair<long, List<Cont>>>(map);
    ranked.Sort((a, b) => TriCtxScore(b.Key, uniLog, idS).CompareTo(TriCtxScore(a.Key, uniLog, idS)));
    map.Clear();
    for (int i = 0; i < maxCtx && i < ranked.Count; i++) map[ranked[i].Key] = ranked[i].Value;
  }

  static void PruneFourByUni(Dictionary<string, List<Cont>> map, int maxCtx, List<float> uniLog, int idS) {
    if (map.Count <= maxCtx) return;
    var ranked = new List<KeyValuePair<string, List<Cont>>>(map);
    ranked.Sort((a, b) => FourCtxScore(b.Key, uniLog, idS).CompareTo(FourCtxScore(a.Key, uniLog, idS)));
    map.Clear();
    for (int i = 0; i < maxCtx && i < ranked.Count; i++) map[ranked[i].Key] = ranked[i].Value;
  }

  public static void Run(string arpaPath, string jsonPath, string gzPath) {
    var inv = new Dictionary<string,int>(StringComparer.Ordinal);
    var vocab = new List<string>();
    var uniLog = new List<float>();
    var uniBow = new List<float>();
    int idS = -1, idEos = -1;

    // Pass 1: unigrams only (then 2-grams section start ends pass)
    int section = 0;
    using (var stream = OpenReadMaybeGzip(arpaPath)) {
      foreach (var raw in ReadLines(stream)) {
        var line = raw.Trim();
        if (line.Length == 0) continue;
        if (line.StartsWith("\\1-grams:")) { section = 1; continue; }
        if (line.StartsWith("\\2-grams:")) break;
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
    }
    Console.WriteLine("vocab=" + vocab.Count);

    var bi = new Dictionary<int, List<Cont>>();
    var tri = new Dictionary<long, List<Cont>>();
    var four = new Dictionary<string, List<Cont>>();
    int biSeen = 0, triSeen = 0, fourSeen = 0;
    // Allow temporary growth then prune by unigram context mass (common phrases first).
    int triSoftCap = MaxCtx3 * 2;
    int fourSoftCap = MaxCtx4 * 2;

    // Pass 2: higher-order n-grams with online top-K + periodic MaxCtx prune
    section = 0;
    using (var stream = OpenReadMaybeGzip(arpaPath)) {
      foreach (var raw in ReadLines(stream)) {
        var line = raw.Trim();
        if (line.Length == 0) continue;
        if (line.StartsWith("\\2-grams:")) { section = 2; continue; }
        if (line.StartsWith("\\3-grams:")) {
          section = 3;
          Console.WriteLine("after2 biCtx=" + bi.Count + " biRows~=" + biSeen);
          continue;
        }
        if (line.StartsWith("\\4-grams:")) {
          section = 4;
          PruneTriByUni(tri, MaxCtx3, uniLog, idS);
          Console.WriteLine("after3 triCtx=" + tri.Count + " triRows~=" + triSeen);
          continue;
        }
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
          if (!bi.TryGetValue(w1, out list)) {
            list = new List<Cont>(Math.Min(8, TopK2));
            bi[w1] = list;
          }
          AddTopK(list, new Cont(w2, logp), TopK2);
          biSeen++;
        } else if (section == 3) {
          int w1, w2, w3;
          if (!inv.TryGetValue(parts[1], out w1) || !inv.TryGetValue(parts[2], out w2) || !inv.TryGetValue(parts[3], out w3)) continue;
          if (w3 == idEos) continue;
          long key = ((long)w1 << 16) | (ushort)w2;
          List<Cont> list;
          if (!tri.TryGetValue(key, out list)) {
            if (tri.Count >= triSoftCap) {
              PruneTriByUni(tri, MaxCtx3, uniLog, idS);
              Console.WriteLine("  tri soft-prune ctx=" + tri.Count + " rows=" + triSeen);
            }
            // After prune, only admit new contexts that beat the soft floor of commonness.
            if (tri.Count >= MaxCtx3) {
              float score = UniScore(uniLog, w1, idS) + UniScore(uniLog, w2, idS);
              // Rough floor: two mid-frequency words (~-3 each) still ok; rare+rare skip.
              if (score < -8.5f) { triSeen++; continue; }
            }
            list = new List<Cont>(Math.Min(4, TopK3));
            tri[key] = list;
          }
          AddTopK(list, new Cont(w3, logp), TopK3);
          triSeen++;
          if (triSeen % 2000000 == 0) {
            PruneTriByUni(tri, MaxCtx3, uniLog, idS);
            Console.WriteLine("  tri progress rows=" + triSeen + " ctx=" + tri.Count);
          }
        } else if (section == 4) {
          int w1, w2, w3, w4;
          if (!inv.TryGetValue(parts[1], out w1) || !inv.TryGetValue(parts[2], out w2) ||
              !inv.TryGetValue(parts[3], out w3) || !inv.TryGetValue(parts[4], out w4)) continue;
          if (w4 == idEos) continue;
          string key = w1 + "," + w2 + "," + w3;
          List<Cont> list;
          if (!four.TryGetValue(key, out list)) {
            if (four.Count >= fourSoftCap) {
              PruneFourByUni(four, MaxCtx4, uniLog, idS);
              Console.WriteLine("  four soft-prune ctx=" + four.Count + " rows=" + fourSeen);
            }
            if (four.Count >= MaxCtx4) {
              float score = UniScore(uniLog, w1, idS) + UniScore(uniLog, w2, idS) + UniScore(uniLog, w3, idS);
              if (score < -12f) { fourSeen++; continue; }
            }
            list = new List<Cont>(Math.Min(4, TopK4));
            four[key] = list;
          }
          AddTopK(list, new Cont(w4, logp), TopK4);
          fourSeen++;
          if (fourSeen % 2000000 == 0) {
            PruneFourByUni(four, MaxCtx4, uniLog, idS);
            Console.WriteLine("  four progress rows=" + fourSeen + " ctx=" + four.Count);
          }
        }
      }
    }
    PruneTriByUni(tri, MaxCtx3, uniLog, idS);
    PruneFourByUni(four, MaxCtx4, uniLog, idS);
    Console.WriteLine("ctx2=" + bi.Count + " ctx3=" + tri.Count + " ctx4=" + four.Count);

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

    Console.WriteLine("export words=" + words.Count + " b=" + bObj.Count + " t=" + tObj.Count + " f=" + fObj.Count);

    string metaName = string.IsNullOrEmpty(MetaName) ? "mobile_lm" : MetaName;
    string metaUrl = string.IsNullOrEmpty(MetaUrl) ? "https://digitalcommons.mtu.edu/mobiletext/3/" : MetaUrl;

    using (var sw = new StreamWriter(jsonPath, false, new UTF8Encoding(false))) {
      sw.Write("{\"meta\":{");
      sw.Write("\"name\":" + JStr(metaName) + ",");
      sw.Write("\"source\":\"Vertanen & Kristensson Mobile Text Dataset (CC BY 4.0)\",");
      sw.Write("\"url\":" + JStr(metaUrl) + ",");
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
    using (var gz = new GZipStream(output, CompressionLevel.Optimal)) {
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
[ArpaConvert]::MetaName = $MetaName
[ArpaConvert]::MetaUrl = $MetaUrl
[ArpaConvert]::Run($ArpaPath, $OutJson, $OutGz)
Write-Host "Done. Ship $OutGz (delete intermediate JSON if desired)."
Write-Host "Attribution: data/NOTICE-mobile-lm.txt"
