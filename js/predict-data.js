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

  /** Closed-class + high-value open-class seeds for slot candidates / slotLogBoost. */
  const WORD_CLASS = {
    det: [
      "a", "an", "the", "this", "that", "these", "those", "my", "your", "his", "her", "our", "their",
      "some", "any", "no", "every", "each", "more", "less", "much", "many", "few", "all", "both",
      "another", "other", "such", "enough", "several", "most", "own", "same", "half", "whole"
    ],
    pron: [
      "i", "you", "he", "she", "we", "they", "it", "me", "him", "her", "us", "them",
      "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves",
      "someone", "somebody", "something", "anyone", "anybody", "anything",
      "everyone", "everybody", "everything", "nothing", "nobody", "none",
      "one", "ones", "this", "that", "these", "those", "who", "whom", "whose", "which", "what"
    ],
    modal: [
      "can", "could", "will", "would", "should", "may", "might", "must", "shall", "ought", "need"
    ],
    aux: [
      "is", "are", "was", "were", "be", "been", "being", "am",
      "do", "does", "did", "have", "has", "had", "having"
    ],
    prep: [
      "to", "of", "in", "on", "at", "for", "with", "from", "about", "into", "over", "under",
      "after", "before", "by", "as", "like", "than", "without", "within", "through", "across",
      "between", "among", "against", "during", "until", "since", "toward", "towards", "onto",
      "upon", "near", "off", "out", "up", "down", "around", "behind", "beside", "beyond",
      "along", "above", "below", "inside", "outside", "except", "plus", "via", "per"
    ],
    conj: [
      "and", "or", "but", "so", "if", "because", "when", "while", "although", "though",
      "unless", "until", "since", "whether", "nor", "yet", "once", "whereas", "plus"
    ],
    wh: [
      "what", "where", "when", "why", "who", "whom", "whose", "which", "how",
      "whatever", "wherever", "whenever", "whoever", "whichever"
    ],
    neg: ["not", "no", "never", "none", "neither", "nor", "nobody", "nothing", "nowhere"],
    adv: [
      "now", "later", "today", "tomorrow", "yesterday", "tonight", "here", "there", "everywhere",
      "somewhere", "anywhere", "nowhere", "soon", "again", "still", "also", "just", "very",
      "really", "quite", "pretty", "too", "enough", "almost", "already", "always", "often",
      "sometimes", "usually", "rarely", "seldom", "ever", "never", "please", "maybe", "perhaps",
      "probably", "definitely", "actually", "basically", "simply", "only", "even", "still",
      "outside", "inside", "home", "away", "back", "forward", "together", "alone", "well",
      "badly", "quickly", "slowly", "carefully", "easily", "hard", "late", "early", "long",
      "far", "near", "up", "down", "out", "in", "off", "on", "over", "around", "else",
      "instead", "anyway", "somehow", "somewhat", "rather", "especially", "exactly", "right",
      "ago", "yet", "once", "twice", "first", "next", "then", "finally", "last", "online"
    ],
    verb: [
      // Core wants / needs / cognition
      "want", "need", "like", "love", "hate", "feel", "think", "know", "guess", "hope", "wish",
      "believe", "mean", "seem", "mind", "care", "prefer", "agree", "disagree", "decide",
      "choose", "plan", "expect", "remember", "forget", "understand", "learn", "teach",
      // Motion / presence
      "go", "come", "get", "leave", "stay", "wait", "walk", "run", "sit", "stand", "lie",
      "move", "return", "arrive", "visit", "travel", "drive", "ride", "fly", "fall", "rise",
      // Handling / making
      "make", "do", "take", "give", "put", "bring", "send", "hold", "keep", "drop", "pick",
      "find", "lose", "use", "try", "fix", "break", "build", "open", "close", "turn",
      "push", "pull", "press", "touch", "carry", "set", "place", "fill", "empty", "clean",
      "wash", "cook", "buy", "pay", "sell", "order", "share", "save", "spend", "change",
      // Communication
      "say", "tell", "ask", "answer", "call", "text", "email", "write", "read", "talk",
      "speak", "listen", "hear", "watch", "look", "see", "show", "explain", "describe",
      "repeat", "mention", "promise", "thank", "invite", "meet", "welcome",
      // Body / care
      "eat", "drink", "sleep", "rest", "wake", "hurt", "ache", "breathe", "cough", "sneeze",
      "swallow", "chew", "taste", "smell", "stretch", "exercise", "shower", "bath",
      "dress", "wear", "brush", "shave", "heal", "help", "check", "test",
      // Activity / work
      "work", "play", "start", "stop", "finish", "begin", "continue", "pause", "resume",
      "practice", "study", "draw", "paint", "sing", "dance",
      "install", "download", "upload", "search", "type", "click", "scroll", "charge",
      // Social / support
      "support", "join", "follow", "lead", "allow", "let", "prevent",
      "protect", "worry", "relax", "enjoy", "miss", "hug", "kiss", "smile", "laugh", "cry",
      // Progressive / 3sg forms that often appear as full tokens
      "going", "coming", "trying", "looking", "waiting", "getting", "making", "taking",
      "having", "doing", "being", "seeing", "hearing", "feeling", "thinking", "talking",
      "working", "playing", "reading", "writing", "eating", "drinking", "sleeping",
      "needs", "likes", "loves", "feels", "thinks", "knows", "goes", "comes",
      "gets", "makes", "helps", "sees", "says", "tells", "asks", "gives", "takes"
    ],
    adj: [
      // Evaluation
      "good", "bad", "fine", "okay", "ok", "great", "awesome", "wonderful", "excellent",
      "nice", "better", "best", "worse", "worst", "alright", "perfect", "terrible",
      "horrible", "amazing", "cool", "weird", "strange", "normal", "special", "important",
      "useful", "useless", "interesting", "boring", "funny", "serious", "true", "false",
      "right", "wrong", "correct", "possible", "impossible", "sure", "certain", "clear",
      // Feeling / body
      "happy", "sad", "tired", "exhausted", "hungry", "thirsty", "hot", "cold", "warm",
      "sick", "ill", "well", "healthy", "sore", "painful", "dizzy", "nauseous",
      "scared", "afraid", "nervous", "anxious", "angry", "mad", "upset", "frustrated",
      "annoyed", "bored", "lonely", "excited", "proud", "embarrassed", "confused",
      "calm", "relaxed", "stressed", "worried", "hopeful", "grateful", "thankful",
      // State / property
      "ready", "busy", "free", "available", "full", "empty", "open", "closed", "locked",
      "broken", "fixed", "new", "old", "young", "big", "small", "large", "little", "long",
      "short", "high", "low", "heavy", "light", "hard", "soft", "easy", "difficult",
      "simple", "quick", "slow", "fast", "loud", "quiet", "noisy", "bright", "dark",
      "clean", "dirty", "wet", "dry", "safe", "dangerous", "strong", "weak",
      // Social / preference
      "friendly", "kind", "mean", "rude", "polite", "private", "public", "personal",
      "favorite", "popular", "same", "different", "other", "next", "last", "first",
      "second", "final", "early", "late", "online", "offline", "local",
      "enough", "extra", "only", "whole", "half", "real", "fake", "paid"
    ],
    noun: [
      // Food / drink
      "water", "food", "drink", "snack", "coffee", "tea", "juice", "milk", "soda", "soup",
      "meal", "breakfast", "lunch", "dinner", "pizza", "sandwich", "bread", "fruit", "apple",
      "banana", "vegetable", "salad", "meat", "chicken", "fish", "egg", "cheese", "rice",
      "pasta", "cookie", "cake", "ice", "cream", "sugar", "salt", "pepper", "sauce",
      // Body / health
      "bathroom", "restroom", "toilet", "shower", "bath", "medicine", "pill", "nurse",
      "doctor", "hospital", "clinic", "pain", "headache", "stomach", "back", "leg", "arm",
      "hand", "foot", "head", "neck", "throat", "chest", "eye", "ear", "mouth", "tooth",
      "blood", "fever", "cold", "cough", "allergy", "appointment", "therapy", "wheelchair",
      // Home / objects
      "home", "house", "apartment", "room", "bedroom", "kitchen", "living", "office",
      "bed", "chair", "table", "desk", "door", "window", "light", "lamp", "floor", "wall",
      "blanket", "pillow", "towel", "clothes", "shirt", "pants", "shoes", "jacket", "hat",
      "bag", "keys", "wallet", "money", "card", "paper", "pen", "pencil", "box", "bottle",
      // Tech / media
      "phone", "tablet", "computer", "laptop", "remote", "tv", "television", "screen",
      "music", "song", "movie", "video", "show", "game", "app", "internet", "wifi",
      "email", "message", "text", "call", "camera", "photo", "picture", "battery", "charger",
      "keyboard", "mouse", "speaker", "headphones", "microphone", "book", "magazine", "news",
      // People / relations
      "friend", "family", "mom", "dad", "mother", "father", "parent", "brother", "sister",
      "son", "daughter", "baby", "child", "kids", "wife", "husband", "partner", "neighbor",
      "teacher", "student", "boss", "coworker", "doctor", "nurse", "person", "people",
      "man", "woman", "boy", "girl", "someone", "everyone", "anyone", "name",
      // Places / transport
      "school", "work", "job", "store", "shop", "mall", "park", "street", "road", "city",
      "town", "church", "library", "bank", "restaurant", "cafe", "hotel", "airport",
      "station", "bus", "car", "taxi", "train", "plane", "bike", "subway", "parking",
      // Time / abstract
      "time", "minute", "hour", "day", "night", "morning", "afternoon", "evening", "week",
      "month", "year", "today", "tomorrow", "yesterday", "weekend", "birthday", "holiday",
      "help", "break", "rest", "problem", "question", "answer", "idea", "plan", "way",
      "thing", "stuff", "part", "side", "end", "start", "number", "word", "story", "reason",
      "weather", "rain", "sun", "snow", "wind", "temperature", "outside", "inside"
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

  /**
   * First matching rule wins (order = specificity).
   * when: prev1Empty | prev1/2/3 | prev1In/prev2In | prev1Class/prev2Class
   * prefer: WORD_CLASS keys and/or short literal words (≤6 chars for candidate expand)
   */
  const SLOT_RULES = [
    // --- Bigrams / multi-word (most specific) ---
    { when: { prev2In: ["want", "need", "like", "love", "prefer", "have", "has", "had", "going", "trying", "looking", "waiting", "used", "ought", "supposed"], prev1: "to" }, prefer: ["verb"] },
    { when: { prev2In: ["going", "looking", "waiting", "ready", "time"], prev1: "for" }, prefer: ["det", "noun", "pron", "verb"] },
    { when: { prev2In: ["i", "you", "we", "they", "he", "she"], prev1In: ["am", "is", "are", "was", "were"] }, prefer: ["adj", "verb", "det", "adv", "not"] },
    { when: { prev2In: ["i", "you", "we", "they", "he", "she"], prev1In: ["do", "does", "did"] }, prefer: ["verb", "not", "pron"] },
    { when: { prev2In: ["i", "you", "we", "they", "he", "she"], prev1In: ["have", "has", "had"] }, prefer: ["verb", "det", "noun", "adv", "not"] },
    { when: { prev2In: ["i", "you", "we", "they"], prev1In: ["will", "would", "can", "could", "should", "might", "must"] }, prefer: ["verb", "not", "adv", "pron"] },
    { when: { prev2: "what", prev1In: ["do", "did", "does", "are", "is", "was", "were", "can", "could", "should", "would"] }, prefer: ["pron", "det", "verb"] },
    { when: { prev2: "how", prev1In: ["are", "is", "do", "did", "can", "could", "about"] }, prefer: ["pron", "det", "adj", "adv"] },
    { when: { prev2: "how", prev1: "are" }, prefer: ["pron", "you"] },
    { when: { prev2In: ["thank", "thanks"], prev1: "you" }, prefer: ["so", "for", "very"] },
    { when: { prev2: "thank", prev1: "you" }, prefer: ["so", "for"] },
    { when: { prev2: "let", prev1: "me" }, prefer: ["verb", "know", "see", "try"] },
    { when: { prev2: "see", prev1: "you" }, prefer: ["soon", "later", "tomorrow"] },
    { when: { prev2: "sounds", prev1: "like" }, prefer: ["det", "noun", "pron", "adj"] },
    { when: { prev2: "that", prev1In: ["sounds", "makes", "seems"] }, prefer: ["adj", "good", "sense"] },
    { when: { prev2: "i", prev1In: ["really", "just", "also", "still"] }, prefer: ["verb", "aux", "modal", "adv"] },
    { when: { prev2In: ["a", "an", "the", "this", "that", "my", "your"], prev1Class: "adj" }, prefer: ["noun"] },
    { when: { prev2Class: "modal", prev1: "not" }, prefer: ["verb", "adv"] },
    { when: { prev2In: ["do", "does", "did", "is", "are", "was", "were", "have", "has", "had"], prev1: "not" }, prefer: ["verb", "adj", "adv", "det"] },
    { when: { prev2: "there", prev1In: ["is", "are", "was", "were"] }, prefer: ["det", "noun", "adj", "some"] },
    { when: { prev2: "it", prev1In: ["is", "was", "'s"] }, prefer: ["adj", "det", "noun", "adv"] },
    { when: { prev2: "this", prev1In: ["is", "was"] }, prefer: ["det", "noun", "adj", "pron"] },
    { when: { prev2: "i", prev1In: ["would", "will", "'d", "'ll"] }, prefer: ["verb", "like", "love", "need"] },

    // --- Contractions / fused prev1 (kept as one token) ---
    { when: { prev1In: ["i'm", "im"] }, prefer: ["adj", "verb", "adv", "not", "going"] },
    { when: { prev1In: ["i'll", "ill"] }, prefer: ["verb", "be", "see", "try"] },
    { when: { prev1In: ["i'd", "id"] }, prefer: ["verb", "like", "love", "prefer"] },
    { when: { prev1In: ["i've", "ive"] }, prefer: ["verb", "been", "got", "had"] },
    { when: { prev1In: ["you're", "youre", "we're", "theyre", "they're"] }, prefer: ["adj", "verb", "adv", "det"] },
    { when: { prev1In: ["don't", "dont", "doesn't", "doesnt", "didn't", "didnt"] }, prefer: ["verb", "pron", "adv"] },
    { when: { prev1In: ["can't", "cant", "won't", "wont", "wouldn't", "wouldnt", "shouldn't", "shouldnt", "couldn't", "couldnt"] }, prefer: ["verb", "adv"] },
    { when: { prev1In: ["isn't", "isnt", "aren't", "arent", "wasn't", "wasnt", "weren't", "werent"] }, prefer: ["adj", "verb", "det", "adv"] },
    { when: { prev1In: ["that's", "thats", "what's", "whats", "there's", "theres", "where's", "wheres"] }, prefer: ["det", "noun", "adj", "pron", "verb"] },
    { when: { prev1In: ["let's", "lets"] }, prefer: ["verb", "go", "see", "try"] },

    // --- High-frequency single tokens ---
    { when: { prev1In: ["i", "you", "we", "they", "he", "she"] }, prefer: ["verb", "aux", "modal", "adv"] },
    { when: { prev1In: ["me", "him", "us", "them"] }, prefer: ["prep", "conj", "adv", "verb"] },
    { when: { prev1Class: "det" }, prefer: ["noun", "adj"] },
    { when: { prev1In: ["some", "any", "more", "much", "many", "few", "lot"] }, prefer: ["noun", "adj", "of"] },
    { when: { prev1: "to" }, prefer: ["verb"] },
    { when: { prev1: "please" }, prefer: ["verb", "pron", "adv"] },
    { when: { prev1: "thank" }, prefer: ["you", "pron"] },
    { when: { prev1: "thanks" }, prefer: ["for", "so", "you"] },
    { when: { prev1: "sorry" }, prefer: ["about", "for", "i", "pron"] },
    { when: { prev1: "let" }, prefer: ["me", "us", "pron"] },
    { when: { prev1: "see" }, prefer: ["you", "det", "pron", "if"] },
    { when: { prev1In: ["hello", "hi", "hey"] }, prefer: ["pron", "there", "how"] },
    { when: { prev1In: ["yes", "yeah", "yep", "sure", "okay", "ok", "no", "nope"] }, prefer: ["pron", "please", "thank", "i", "det"] },
    { when: { prev1In: ["good"] }, prefer: ["noun", "morning", "night", "day", "adj"] },
    { when: { prev1In: ["very", "really", "so", "too", "quite", "pretty"] }, prefer: ["adj", "adv"] },
    { when: { prev1In: ["maybe", "perhaps", "probably"] }, prefer: ["pron", "modal", "adv", "det"] },
    { when: { prev1In: ["here", "there"] }, prefer: ["aux", "is", "are", "pron"] },
    { when: { prev1In: ["now", "later", "today", "tomorrow", "soon", "again"] }, prefer: ["pron", "verb", "conj", "prep"] },
    { when: { prev1In: ["and", "or", "but", "so", "because", "if", "while"] }, prefer: ["pron", "det", "verb", "modal", "adv"] },
    { when: { prev1In: ["then", "also", "just", "still", "even"] }, prefer: ["pron", "verb", "det", "adv"] },
    { when: { prev1In: ["about", "like"] }, prefer: ["det", "noun", "pron", "adj", "verb"] },
    { when: { prev1In: ["of"] }, prefer: ["det", "noun", "pron", "the"] },
    { when: { prev1Class: "modal" }, prefer: ["verb", "pron", "adv", "not"] },
    { when: { prev1In: ["am", "is", "are", "was", "were", "be", "been", "being"] }, prefer: ["adj", "verb", "det", "adv", "not"] },
    { when: { prev1In: ["do", "does", "did"] }, prefer: ["verb", "neg", "pron", "not"] },
    { when: { prev1In: ["have", "has", "had"] }, prefer: ["det", "noun", "verb", "adv", "to"] },
    { when: { prev1In: ["want", "need", "like", "love", "prefer", "get", "make", "take", "give", "find", "use", "try", "help", "start", "stop", "finish"] }, prefer: ["to", "det", "noun", "pron", "adv"] },
    { when: { prev1In: ["go", "come", "leave", "stay", "walk", "sit", "stand"] }, prefer: ["to", "prep", "adv", "home", "there"] },
    { when: { prev1In: ["tell", "ask", "show", "give", "bring", "send"] }, prefer: ["pron", "det", "me", "you"] },
    { when: { prev1In: ["think", "know", "feel", "guess", "hope", "wish"] }, prefer: ["pron", "det", "that", "so", "about"] },
    { when: { prev1In: ["look", "looking", "listen", "listening", "wait", "waiting"] }, prefer: ["prep", "for", "at", "to", "adv"] },
    { when: { prev1In: ["going", "trying"] }, prefer: ["to", "home", "adv"] },
    { when: { prev1Class: "prep" }, prefer: ["det", "noun", "pron", "adj"] },
    { when: { prev1Class: "wh" }, prefer: ["aux", "modal", "pron", "det"] },
    { when: { prev1In: ["not", "no", "never"] }, prefer: ["verb", "adj", "adv", "det"] },
    { when: { prev1Class: "adj" }, prefer: ["noun", "conj", "prep", "adv"] },
    { when: { prev1Class: "verb" }, prefer: ["det", "pron", "prep", "adv", "noun"] },
    { when: { prev1Class: "noun" }, prefer: ["verb", "prep", "conj", "adv", "aux"] },
    { when: { prev1Class: "adv" }, prefer: ["verb", "adj", "pron", "det", "prep"] },
    { when: { prev1Empty: true }, prefer: ["pron", "wh", "modal", "det"] }
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
