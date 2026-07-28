/**
 * VoicePredictData — static seeds, word classes, contraction tables.
 * Loaded before predict-type.js / predict.js.
 */
(function (global) {
  "use strict";

  const DEFAULT_STARTERS = [
    "I", "You", "We", "What", "Where", "When", "How", "Why", "Who",
    "Can", "Could", "Would", "Please", "Hello", "Hi", "Thank", "Sorry", "Yes", "No"
  ];

  const CONVERSATION_SEED = `
Hello how are you today I am fine thank you how about you
Hi there it is good to see you good morning good afternoon good night
I would like some help please can you help me with this
I would like to go home now I would like a drink please
I would like to talk I would like to rest I would like more time
I want to go to the store later can we leave soon
I want to stay here I want some food please I want a snack
I want to watch a movie I want to listen to music I want to sleep
I need water please I am thirsty and a little hungry
I need help please I need a break I need more time I need support
I need the bathroom where is the restroom please
I need my phone I need my glasses I need my charger
That sounds good to me yes please that would be great
No thank you I am okay for now maybe later not right now
Yes please no thank you okay sure maybe I think so I do not think so
What time is it where are we going next what should we do
What do you think about this what do you want to do
I am feeling tired I need a break please wait a moment
I am feeling better I am feeling worse I am feeling okay
Can you please repeat that I did not understand please speak slowly
Can you help me with this can you open the door can you close the window
Can you turn on the light can you turn off the tv can you pass that
How was your day mine was pretty good overall how was work
How are you doing today how about you how was school
I miss you I love you see you soon goodbye for now take care
Please call me when you get home I will be waiting
Please call the nurse please call mom please call for help
Could you open the window it is getting warm in here
Could you help me sit up could you hand me that please
I agree with you that makes a lot of sense to me
I disagree I think we should try a different plan
Please slow down I need more time to answer give me a second
I am happy today I am sad today I am excited about this
I am scared I am frustrated I am bored I am lonely I am proud
Tell me more about that would you like some help
Sorry I made a mistake let me try that again I am sorry
Excuse me could you pass me the remote control
Do you want to go outside do you want some water do you want help
Thanks for your help I really appreciate it thank you so much
You are very kind that means a lot to me you are a good friend
Have a great day you too take care goodbye see you tomorrow
Let me know if you need anything I am here for you
I am not sure about that let me think about it
I want to go home I want to stay I want to leave now
It is too loud in here it is too cold it is too hot
Please be quiet please be gentle that hurts please stop
I can do it myself I need help doing that
I like music I like movies I like being outside I like talking
I do not like that I prefer this instead that is better
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
    ["i", "would", "like"], ["i", "want", "to"], ["i", "want", "a"], ["i", "want", "some"],
    ["i", "need", "help"], ["i", "need", "water"], ["i", "need", "a"], ["i", "need", "more"],
    ["i", "need", "the"], ["i", "need", "to"], ["i", "am", "tired"], ["i", "am", "hungry"],
    ["i", "am", "thirsty"], ["i", "am", "not"], ["i", "am", "fine"], ["i", "am", "happy"],
    ["can", "you", "help"], ["can", "you", "please"], ["can", "you", "open"], ["can", "you", "repeat"],
    ["do", "you", "want"], ["do", "you", "like"], ["do", "you", "have"], ["would", "you", "like"],
    ["want", "to", "go"], ["want", "to", "talk"], ["need", "to", "go"], ["need", "a", "break"],
    ["how", "are", "you"], ["thank", "you", "so"], ["let", "me", "know"], ["please", "help", "me"],
    ["what", "do", "you"], ["where", "is", "the"], ["open", "the", "door"], ["turn", "on", "the"],
    ["i", "love", "you"], ["i", "miss", "you"], ["see", "you", "soon"], ["i", "do", "not"]
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

  const SCORE_WEIGHTS = {
    nextWord: { freq: 0.22, context: 0.42, personal: 0.22, slot: 0.14 },
    p1: { freq: 0.50, context: 0.25, personal: 0.10, slot: 0.15 },
    p2: { freq: 0.40, context: 0.30, personal: 0.12, slot: 0.18 },
    p3: { freq: 0.30, context: 0.32, personal: 0.15, slot: 0.23 },
    p4: { freq: 0.18, context: 0.32, personal: 0.22, slot: 0.28 },
    exactMatch: 0.35,
    prefixGrow: 0.08,
    orthography: 0.55
  };

  const STUPID_BACKOFF_ALPHA = 0.4;

  const FREQ_LIST_URL =
    "https://cdn.jsdelivr.net/gh/first20hours/google-10000-english@master/google-10000-english-usa-no-swears.txt";
  const LS_FREQ_KEY = "voice_predict_freq_v1";
  const LS_PERSONAL_KEY = "voice_predict_personal_v1";
  const LS_PERSONAL_TEXT_KEY = "voice_predict_personal_text_v1";

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
    STUPID_BACKOFF_ALPHA,
    FREQ_LIST_URL,
    LS_FREQ_KEY,
    LS_PERSONAL_KEY,
    LS_PERSONAL_TEXT_KEY
  };
})(typeof window !== "undefined" ? window : globalThis);
