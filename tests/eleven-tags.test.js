"use strict";

const assert = require("assert");
require("../js/speech-engines.js");
require("../js/eleven.js");

const Eleven = global.AacEleven;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(
        () => console.log("ok  " + name),
        (err) => {
          failed += 1;
          console.error("FAIL " + name);
          console.error(err && err.stack || err);
        }
      );
    }
    console.log("ok  " + name);
  } catch (err) {
    failed += 1;
    console.error("FAIL " + name);
    console.error(err && err.stack || err);
  }
  return Promise.resolve();
}

function same(actual, expected) {
  assert.deepStrictEqual(actual, expected);
}

const tests = [];

function add(name, fn) {
  tests.push([name, fn]);
}

add("untagged lines stay one request", () => {
  same(Eleven.taggedSends("Hello, how are you?", ""), ["Hello, how are you?"]);
});

add("standing style is repeated after each breath", () => {
  same(Eleven.taggedSends("Hello, how are you? I am here.", "happy"), [
    "[happy] Hello,",
    "[happy] how are you?",
    "[happy] I am here."
  ]);
});

add("one breath stays one request", () => {
  same(Eleven.taggedSends("Hello there", "whisper"), ["[whisper] Hello there"]);
});

add("a phrase that already starts with the style is not doubled", () => {
  same(Eleven.taggedSends("[happy] Hello, there.", "happy"), [
    "[happy] Hello,",
    "[happy] there."
  ]);
});

add("the opening tag is repeated, and a later tag stays on its breath", () => {
  same(Eleven.taggedSends("[whisper] Hello, there. [loud] Bye, friend.", ""), [
    "[whisper] Hello,",
    "[whisper] there.",
    "[loud] Bye,",
    "[whisper] friend."
  ]);
});

add("standing style stacks in front of an inline tag", () => {
  same(Eleven.taggedSends("[whisper] Hello, there.", "happy"), [
    "[happy] [whisper] Hello,",
    "[happy] [whisper] there."
  ]);
});

add("a tag in the middle of a breath stays on that breath", () => {
  same(Eleven.taggedSends("Pay [laughs] now. Next.", "happy"), [
    "[happy] Pay [laughs] now.",
    "[happy] Next."
  ]);
});

add("a tag-only breath rides along instead of being its own request", () => {
  same(Eleven.taggedSends("Hello. [sighs] There. Again.", "happy"), [
    "[happy] Hello.",
    "[happy] [sighs] There.",
    "[happy] Again."
  ]);
  same(Eleven.taggedSends("Hello. [sighs]", "happy"), ["[happy] Hello. [sighs]"]);
});

add("numbers, names, and domains do not split early", () => {
  same(Eleven.taggedSends("Pay 1,000.50 today, thanks.", "happy"), [
    "[happy] Pay 1,000.50 today,",
    "[happy] thanks."
  ]);
  same(Eleven.taggedSends("Meet at 3:30, please.", "happy"), [
    "[happy] Meet at 3:30,",
    "[happy] please."
  ]);
  same(Eleven.taggedSends("Visit example.com, please.", "happy"), [
    "[happy] Visit example.com,",
    "[happy] please."
  ]);
  same(Eleven.taggedSends("So did I. Then I left.", "happy"), [
    "[happy] So did I.",
    "[happy] Then I left."
  ]);
});

add("ellipsis, dash, and newline are breaths", () => {
  same(Eleven.taggedSends("Wait... what?", "happy"), [
    "[happy] Wait...",
    "[happy] what?"
  ]);
  same(Eleven.taggedSends("Wait — what?", "happy"), [
    "[happy] Wait —",
    "[happy] what?"
  ]);
  same(Eleven.taggedSends("Hello\nthere.", "happy"), [
    "[happy] Hello",
    "[happy] there."
  ]);
});

add("a comma inside a tag is not a breath", () => {
  same(Eleven.taggedSends("[low, slow] Hello, there.", ""), [
    "[low, slow] Hello,",
    "[low, slow] there."
  ]);
});

function pcmResponse(bytes) {
  let sent = false;
  return {
    ok: true,
    headers: { get: () => "application/octet-stream" },
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        }
      })
    }
  };
}

function installFetch(handler) {
  const previous = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.text);
    return handler(body.text, calls);
  };
  return {
    calls,
    restore: () => { global.fetch = previous; }
  };
}

add("collectPcm stitches each breath in order", async () => {
  const fake = installFetch((text) => {
    const marker = text.indexOf("there") === -1 ? 1 : 2;
    return pcmResponse(new Uint8Array([marker, 0, marker, 0]));
  });
  try {
    const collected = await Eleven.collectPcm({
      phrases: ["[happy] Hello,", "[happy] there."],
      voiceId: "voice",
      apiKey: "key",
      speed: 1,
      pitch: 1
    });
    same(fake.calls, ["[happy] Hello,", "[happy] there."]);
    same(Array.from(collected.pcm), [1, 0, 1, 0, 2, 0, 2, 0]);
    assert.strictEqual(collected.sampleRate, 24000);
    assert.strictEqual(collected.modelId, "eleven_v4_turbo");
  } finally {
    fake.restore();
  }
});

function fakeContext() {
  const starts = [];
  return {
    starts,
    state: "running",
    currentTime: 0,
    createGain: () => ({
      gain: { value: 1 },
      connect() {},
      disconnect() {}
    }),
    createBuffer: (_ch, length, rate) => ({
      duration: length / rate,
      copyToChannel() {}
    }),
    createBufferSource: () => {
      const src = {
        connect() {},
        start(when) { starts.push(when); },
        disconnect() {},
        onended: null
      };
      const realStart = src.start.bind(src);
      src.start = (when) => {
        realStart(when);
        setTimeout(() => { if (src.onended) src.onended(); }, 0);
      };
      return src;
    }
  };
}

add("playStream plays breaths in order and reports one clip", async () => {
  const fake = installFetch((text) => {
    const marker = text.indexOf("there") === -1 ? 11 : 22;
    return pcmResponse(new Uint8Array([marker, 0, marker, 0]));
  });
  const ctx = fakeContext();
  let started = 0;
  let ended = 0;
  let saved = null;
  try {
    await Eleven.playStream({
      phrases: ["[happy] Hello,", "[happy] there."],
      voiceId: "voice",
      apiKey: "key",
      speed: 1,
      pitch: 1,
      gain: 1,
      getContext: async () => ctx,
      outputNode: {},
      onStarted: () => { started += 1; },
      onEnded: () => { ended += 1; },
      onPcm: (pcm) => { saved = Array.from(pcm); }
    });
    assert.strictEqual(started, 1);
    assert.strictEqual(ended, 1);
    same(fake.calls, ["[happy] Hello,", "[happy] there."]);
    same(saved, [11, 0, 11, 0, 22, 0, 22, 0]);
    assert.ok(ctx.starts.length >= 2);
    assert.ok(ctx.starts[1] >= ctx.starts[0]);
  } finally {
    fake.restore();
  }
});

add("a failed later breath is not saved", async () => {
  const fake = installFetch((text) => {
    if (text.indexOf("there") !== -1) {
      return { ok: false, status: 500, body: { cancel: async () => {} } };
    }
    return pcmResponse(new Uint8Array([1, 0]));
  });
  const ctx = fakeContext();
  let saved = false;
  try {
    await Eleven.playStream({
      phrases: ["[happy] Hello,", "[happy] there."],
      voiceId: "voice",
      apiKey: "key",
      speed: 1,
      pitch: 1,
      gain: 1,
      getContext: async () => ctx,
      outputNode: {},
      onPcm: () => { saved = true; }
    });
    assert.fail("expected the second breath to fail");
  } catch (err) {
    assert.ok(err);
    assert.strictEqual(saved, false);
  } finally {
    fake.restore();
  }
});

(async () => {
  for (let i = 0; i < tests.length; i++) {
    await test(tests[i][0], tests[i][1]);
  }
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
})();
