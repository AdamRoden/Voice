/**
 * VoicePredictData — static seeds, word classes, contraction tables.
 * Loaded before predict-type.js / predict.js.
 */
(function (global) {
  "use strict";

  const DEFAULT_STARTERS = [
    "I", "I'm", "You", "We", "What", "How", "Why", "When", "Where", "Who",
    "Can", "Could", "Would", "Do", "Did", "Is", "Are", "That", "This",
    "Yes", "No", "Okay", "Sure", "Maybe", "Please", "Thanks", "Sorry",
    "Hello", "Hi", "Hey", "So", "Well", "Actually", "Just", "Also"
  ];

  /**
   * Light conversational prior (not a full LM). Mobile forum 4-gram is primary;
   * this nudges everyday chat phrases the n-gram may under-represent.
   */
  const CONVERSATION_SEED = `
Hello how are you today I am fine thank you how about you
Hi there it is good to see you good morning good afternoon good night hey what is up
How are you doing today how have you been what is new with you
I think so I do not think so I am not sure about that let me think about it
I guess so that makes sense I agree with you I see what you mean
That sounds good to me that would be great that is fine with me
Yes please no thank you okay sure maybe later not right now of course
What do you think about this what do you want to do what should we do
What time is it where are we going next when do you want to leave
I would like to go I would like to talk I would like that
I want to go I want to stay I want to know I want to see
I need to go I need to leave I need a minute I need to think
Can you help me with this can you tell me more can you wait a second
Could you please do that would you like to come along
Do you want to go do you want to talk do you know what I mean
I am going to I am trying to I am looking for I am waiting for
I have to I have been I have not I have a question
It is okay it is fine it is hard to say it is up to you
There is a there are some this is why that is why
I really like I really think I really need I really appreciate
Thanks for your help thank you so much I appreciate it
Sorry about that I am sorry let me try that again
See you soon see you later take care talk to you later goodbye
Let me know if you need anything keep me posted sounds like a plan
I will be there I will call you I will text you I will let you know
We should go we should talk we can figure it out
Just so you know by the way for example in other words
I miss you I love you hope you are well have a great day
Please wait a moment give me a second hang on a minute
I did not understand can you say that again please speak slowly
I am busy right now I am free later I am on my way
I like that I do not like that I prefer this instead
Tell me more about that that is interesting that is funny
Maybe we can try something else what if we did this instead
`;

  const WORD_CLASS = {
    det: ["a", "an", "the", "this", "that", "these", "those", "my", "your", "his", "her", "our", "their", "some", "any", "no", "every", "each", "more", "less", "much", "many"],
    pron: ["i", "you", "he", "she", "we", "they", "it", "me", "him", "her", "us", "them", "someone", "something", "anything", "everything", "nothing"],
    modal: ["can", "could", "will", "would", "should", "may", "might", "must", "shall"],
    aux: ["is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "have", "has", "had"],
    prep: ["to", "of", "in", "on", "at", "for", "with", "from", "about", "into", "over", "under", "after", "before", "by", "as", "like", "than", "without"],
    conj: ["and", "or", "but", "so", "if", "because", "when", "while"],
    wh: ["what", "where", "when", "why", "who", "which", "how"],
    neg: ["not", "no", "never"],
    adv: ["now", "later", "today", "tomorrow", "here", "there", "soon", "again", "still", "also", "just", "very", "really", "too", "please", "outside", "inside", "home", "well", "maybe"],
    verb: [
      "want", "need", "like", "love", "hate", "feel", "think", "know", "go", "come", "get", "make",
      "help", "see", "look", "hear", "say", "tell", "ask", "call", "open", "close", "turn", "give",
      "take", "put", "find", "use", "try", "stop", "start", "wait", "stay", "leave", "eat", "drink",
      "sleep", "rest", "walk", "sit", "stand", "read", "write", "play", "watch", "listen", "talk",
      "speak", "work", "pass", "hold", "bring", "show", "change", "move", "thank", "understand",
      "remember", "forget", "agree", "disagree", "prefer", "hurt", "repeat", "finish"
    ],
    adj: [
      "good", "bad", "fine", "okay", "great", "better", "worse", "happy", "sad", "tired", "hungry",
      "thirsty", "hot", "cold", "warm", "loud", "quiet", "sick", "scared", "angry", "bored",
      "lonely", "excited", "proud", "frustrated", "ready", "busy", "full", "open", "closed",
      "easy", "hard", "important", "funny", "safe", "sure", "right", "wrong", "next", "enough"
    ],
    noun: [
      "water", "food", "drink", "snack", "coffee", "tea", "meal", "lunch", "dinner", "pizza",
      "bathroom", "restroom", "home", "room", "bed", "chair", "door", "window", "light", "phone",
      "tablet", "remote", "tv", "music", "movie", "game", "book", "medicine", "nurse", "doctor",
      "hospital", "pain", "break", "time", "help", "friend", "family", "mom", "dad", "school",
      "work", "bus", "car", "store", "blanket", "name", "day", "night", "morning"
    ]
  };

  const SEED_TRIGRAMS = [
    ["i", "would", "like"], ["i", "want", "to"], ["i", "want", "a"], ["i", "need", "to"],
    ["i", "am", "not"], ["i", "am", "going"], ["i", "have", "to"], ["i", "have", "been"],
    ["i", "do", "not"], ["i", "did", "not"], ["i", "think", "so"], ["i", "think", "that"],
    ["i", "guess", "so"], ["i", "love", "you"], ["i", "miss", "you"], ["i", "will", "be"],
    ["can", "you", "help"], ["can", "you", "tell"], ["can", "you", "please"],
    ["do", "you", "want"], ["do", "you", "think"], ["do", "you", "know"], ["do", "you", "have"],
    ["would", "you", "like"], ["could", "you", "please"], ["what", "do", "you"],
    ["how", "are", "you"], ["how", "do", "you"], ["let", "me", "know"], ["let", "me", "see"],
    ["thank", "you", "so"], ["thanks", "for", "the"], ["see", "you", "soon"], ["see", "you", "later"],
    ["want", "to", "go"], ["need", "to", "go"], ["going", "to", "be"], ["have", "to", "go"],
    ["that", "sounds", "good"], ["that", "makes", "sense"], ["sounds", "like", "a"],
    ["what", "if", "we"], ["by", "the", "way"], ["as", "soon", "as"], ["at", "the", "moment"]
  ];

  const SLOT_RULES = [
    { when: { prev1In: ["i", "you", "we", "they", "he", "she"] }, prefer: ["verb", "aux", "modal", "adv"] },
    { when: { prev1Class: "det" }, prefer: ["noun", "adj"] },
    { when: { prev1In: ["some", "any", "more", "much", "many"] }, prefer: ["noun", "adj"] },
    { when: { prev1: "to" }, prefer: ["verb"] },
    { when: { prev1: "please" }, prefer: ["verb", "pron", "adv"] },
    { when: { prev1Class: "modal" }, prefer: ["verb", "pron", "adv"] },
    { when: { prev1In: ["am", "is", "are", "was", "were", "be", "been"] }, prefer: ["adj", "verb", "det", "adv"] },
    { when: { prev1In: ["do", "does", "did"] }, prefer: ["verb", "neg", "pron"] },
    { when: { prev1In: ["have", "has", "had"] }, prefer: ["det", "noun", "verb", "adv"] },
    { when: { prev1In: ["want", "need", "like", "love", "prefer", "get", "make", "take", "give", "find", "use"] }, prefer: ["to", "det", "noun", "pron", "adv"] },
    { when: { prev1Class: "prep" }, prefer: ["det", "noun", "pron", "adj"] },
    { when: { prev1Class: "wh" }, prefer: ["aux", "modal", "pron", "det"] },
    { when: { prev1In: ["not", "no"] }, prefer: ["verb", "adj", "adv", "det"] },
    { when: { prev1Class: "verb" }, prefer: ["det", "pron", "prep", "adv", "noun"] },
    { when: { prev1Class: "noun" }, prefer: ["verb", "prep", "conj", "adv", "aux"] },
    { when: { prev1Empty: true }, prefer: ["pron", "wh", "modal"] }
  ];

  /** Apostrophe-less typings → proper contraction (includes ambiguous ill/id). */
  const CONTRACTION_SHORTCUTS = {
    im: "I'm", ive: "I've", iv: "I've", id: "I'd", ill: "I'll",
    youre: "you're", youve: "you've", youd: "you'd", youll: "you'll",
    weve: "we've", theyre: "they're", theyve: "they've", theyd: "they'd", theyll: "they'll",
    dont: "don't", don: "don't", doesnt: "doesn't", didnt: "didn't",
    isnt: "isn't", arent: "aren't", wasnt: "wasn't", werent: "weren't",
    cant: "can't", wont: "won't", wouldnt: "wouldn't", shouldnt: "shouldn't",
    couldnt: "couldn't", havent: "haven't", hasnt: "hasn't", hadnt: "hadn't",
    thats: "that's", whats: "what's", wheres: "where's", theres: "there's",
    lets: "let's", aint: "ain't", dnt: "don't", cnt: "can't"
  };

  /**
   * Bare forms that are also real words.
   * preferAltWhenPrev: if prev1 is in this set, prefer `alt`; else prefer `contraction`.
   */
  const AMBIGUOUS_READINGS = {
    ill: {
      contraction: "I'll",
      alt: "ill",
      preferAltWhenPrev: new Set([
        "feel", "feeling", "feels", "felt", "am", "was", "is", "are", "were",
        "got", "get", "getting", "look", "looks", "looking", "very", "so",
        "still", "really", "been", "quite", "too"
      ])
    },
    id: {
      contraction: "I'd",
      alt: "ID",
      preferAltWhenPrev: new Set([
        "my", "your", "his", "her", "our", "their", "an", "the", "student",
        "badge", "show", "see", "need", "got", "get", "bring", "check"
      ])
    }
  };

  const AMBIGUOUS_SHORTCUTS = new Set(Object.keys(AMBIGUOUS_READINGS));

  /** Safe auto-rewrite on space/punct = shortcuts minus ambiguous. */
  const AUTO_BOUNDARY_ALWAYS = Object.fromEntries(
    Object.entries(CONTRACTION_SHORTCUTS).filter(([k]) => !AMBIGUOUS_SHORTCUTS.has(k))
  );

  const CONTRACTION_FORMS = {
    i: ["I'm", "I'll", "I'd", "I've"],
    you: ["you're", "you've", "you'd", "you'll"],
    he: ["he's", "he'd", "he'll"],
    she: ["she's", "she'd", "she'll"],
    it: ["it's", "it'll"],
    we: ["we're", "we've", "we'd", "we'll"],
    they: ["they're", "they've", "they'd", "they'll"],
    that: ["that's"],
    what: ["what's"],
    do: ["don't", "doesn't"],
    does: ["doesn't"],
    did: ["didn't"],
    is: ["isn't"],
    are: ["aren't"],
    was: ["wasn't"],
    were: ["weren't"],
    can: ["can't"],
    will: ["won't"],
    would: ["wouldn't"],
    should: ["shouldn't"],
    could: ["couldn't"],
    have: ["haven't"],
    has: ["hasn't"],
    had: ["hadn't"],
    let: ["let's"]
  };

  const I_FAMILY = ["I", "I'm", "I'll", "I'd", "I've"];

  const SPACE_EATING_PUNCT = new Set([".", ",", "!", "?", ";", ":", ")", "]", "}", "…", "—", "-"]);
  const SENTENCE_END_PUNCT = new Set([".", "!", "?"]);

  /** Log-space chip adjustments (base rank is mobile/seed log10). */
  const SCORE_WEIGHTS = {
    exactMatchLog: 0.35,
    prefixGrowLog: 0.08,
    repeatPrevLog: 0.25,
    orthography: 0.55,
    /** Mid-word discount when candidate is keyboard-adjacent fuzzy (not true prefix). */
    fuzzyKeyboardLog: 0.22,
    /** Mid-word discount for non-keyboard single-edit fuzzy. */
    fuzzyOtherLog: 0.45
  };

  /**
   * Boundary did-you-mean / soft autocorrect + mid-word fuzzy policy.
   * Costs: keyboard sub ~0.32, transpose ~0.55, ins/del ~0.72, other sub ~0.85.
   */
  const DID_YOU_MEAN = {
    /** log10 floor for OOV typed token when computing margin. */
    oovFloor: -8,
    /** Min (best − typed) log10 margin to soft-rewrite on boundary. */
    softMargin: 1.1,
    softMaxCost: 0.9,
    /** Require this extra margin over 2nd place to soft-apply. */
    softWinnerGap: 0.25,
    /** Min margin to pin a did-you-mean chip (no silent rewrite). */
    chipMargin: 0.5,
    chipMaxCost: 0.95,
    chipLimit: 2,
    /** Mid-word: always take fuzzy neighbors at or below this cost. */
    fuzzyKeyboardMax: 0.4,
    /** Mid-word: if pool still thin, accept up to this cost. */
    fuzzyMaxCost: 0.95,
    fuzzyLimit: 12
  };

  const STUPID_BACKOFF_ALPHA = 0.4;

  const FREQ_LIST_URL =
    "https://cdn.jsdelivr.net/gh/first20hours/google-10000-english@master/google-10000-english-usa-no-swears.txt";
  /** Compact mobile 4-gram LM derived from Vertanen & Kristensson forum model (CC BY 4.0). */
  const MOBILE_LM_URL = "data/mobile-lm.json.gz";
  const LS_FREQ_KEY = "voice_predict_freq_v1";
  const LS_PERSONAL_KEY = "voice_predict_personal_v1";
  const LS_PERSONAL_TEXT_KEY = "voice_predict_personal_text_v1";

  /** Weak log10 agreement boost when seed and mobile both like a word. */
  const SEED_LOG_BOOST = 0.08;
  /** log10 backoff step when higher-order mobile context misses. */
  const MOBILE_BACKOFF_LOG10 = 0.45;
  const CANDIDATE_LIMIT = 64;
  const CHIP_LIMIT = 9;

  global.VoicePredictData = {
    DEFAULT_STARTERS,
    CONVERSATION_SEED,
    WORD_CLASS,
    SEED_TRIGRAMS,
    SLOT_RULES,
    CONTRACTION_SHORTCUTS,
    AMBIGUOUS_READINGS,
    AMBIGUOUS_SHORTCUTS,
    AUTO_BOUNDARY_ALWAYS,
    CONTRACTION_FORMS,
    I_FAMILY,
    SPACE_EATING_PUNCT,
    SENTENCE_END_PUNCT,
    SCORE_WEIGHTS,
    DID_YOU_MEAN,
    STUPID_BACKOFF_ALPHA,
    FREQ_LIST_URL,
    MOBILE_LM_URL,
    SEED_LOG_BOOST,
    MOBILE_BACKOFF_LOG10,
    CANDIDATE_LIMIT,
    CHIP_LIMIT,
    LS_FREQ_KEY,
    LS_PERSONAL_KEY,
    LS_PERSONAL_TEXT_KEY
  };
})(typeof window !== "undefined" ? window : globalThis);
