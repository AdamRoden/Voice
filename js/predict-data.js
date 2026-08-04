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
   * Conversational n-gram seed (primary offline prior for next-word chips).
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

  /**
   * Offline seed classes (closed + compact AAC open). Full ~10k lexicon loads from
   * data/word-class-10k.json.gz via VoicePredict.loadModels() and merges on top.
   * Order within each list = offline rank (index 0 most preferred).
   */
  const WORD_CLASS = {
    det: [
      "the", "a", "an", "this", "that", "my", "your", "his", "her", "our", "their",
      "some", "any", "all", "no", "every", "each", "more", "most", "other", "another",
      "these", "those", "both", "few", "many", "much", "less", "several", "such",
      "enough", "own", "same", "half", "whole"
    ],
    pron: [
      "i", "you", "it", "we", "they", "he", "she", "me", "him", "her", "us", "them",
      "this", "that", "what", "who", "which", "one", "someone", "something",
      "anyone", "anything", "everyone", "everything", "nothing", "nobody", "none"
    ],
    modal: [
      "can", "will", "would", "could", "should", "may", "might", "must", "shall", "need", "ought"
    ],
    aux: [
      "is", "are", "was", "were", "be", "been", "am", "do", "does", "did",
      "have", "has", "had", "being", "having"
    ],
    prep: [
      "to", "of", "in", "for", "on", "with", "at", "from", "by", "about", "as", "into",
      "like", "through", "after", "over", "between", "out", "without", "before", "under",
      "around", "up", "down", "off", "near", "since", "until", "inside", "outside"
    ],
    conj: [
      "and", "or", "but", "so", "if", "because", "when", "while", "although", "though",
      "unless", "until", "since", "whether", "nor", "yet", "once"
    ],
    wh: [
      "what", "how", "who", "where", "when", "why", "which", "whose", "whom"
    ],
    neg: ["not", "no", "never", "none", "nothing", "nobody", "neither", "nor", "nowhere"],
    // Compact open-class seeds for offline chips; 10k file supplies the rest.
    adv: [
      "just", "also", "now", "then", "here", "there", "very", "really", "so", "too",
      "only", "even", "still", "again", "back", "well", "please", "maybe", "probably",
      "always", "never", "often", "sometimes", "already", "yet", "soon", "later",
      "today", "tomorrow", "home", "away", "together", "instead", "quickly", "slowly"
    ],
    verb: [
      "want", "need", "like", "go", "get", "know", "think", "see", "come", "make",
      "take", "do", "have", "say", "tell", "ask", "give", "help", "feel", "look",
      "try", "use", "find", "work", "call", "love", "hope", "leave", "stay", "wait",
      "open", "close", "start", "stop", "let", "show", "talk", "eat", "drink", "sleep",
      "rest", "hurt", "going", "trying", "looking", "waiting", "getting", "doing"
    ],
    adj: [
      "good", "great", "fine", "okay", "ok", "bad", "nice", "ready", "busy", "free",
      "happy", "sad", "tired", "hungry", "thirsty", "hot", "cold", "sick", "well",
      "better", "sure", "right", "wrong", "easy", "hard", "open", "closed", "full",
      "empty", "broken", "safe", "sore", "painful", "scared", "nervous", "angry",
      "upset", "confused", "calm", "worried", "nauseous", "dizzy"
    ],
    noun: [
      "time", "day", "home", "help", "people", "water", "food", "phone", "work",
      "room", "door", "pain", "bathroom", "doctor", "nurse", "friend", "family",
      "mom", "dad", "child", "medicine", "hospital", "wheelchair", "headache",
      "appointment", "therapy", "message", "call", "question", "problem", "plan",
      "morning", "night", "minute", "hour", "restroom", "pill", "blanket", "chair"
    ]
  };

  /**
   * Seed n-gram phrases (2–5 tokens). Each tuple trains all sub-n-grams up to 5-gram.
   */
  const SEED_PHRASES = [
    // 5-grams (prev4…prev1 → next)
    ["i", "would", "like", "to", "go"],
    ["i", "would", "like", "to", "see"],
    ["i", "would", "like", "to", "know"],
    ["i", "want", "to", "go", "home"],
    ["i", "need", "to", "go", "now"],
    ["i", "am", "going", "to", "be"],
    ["i", "am", "not", "sure", "about"],
    ["do", "you", "want", "to", "go"],
    ["do", "you", "want", "to", "talk"],
    ["would", "you", "like", "to", "come"],
    ["can", "you", "help", "me", "with"],
    ["let", "me", "know", "if", "you"],
    ["how", "are", "you", "doing", "today"],
    ["what", "do", "you", "want", "to"],
    ["what", "do", "you", "think", "about"],
    ["thank", "you", "so", "much", "for"],
    ["that", "sounds", "like", "a", "plan"],
    ["i", "do", "not", "know", "if"],
    ["i", "have", "to", "go", "now"],
    ["see", "you", "later", "on", "today"],
    // 4-grams
    ["i", "would", "like", "to"],
    ["i", "want", "to", "go"],
    ["i", "need", "to", "go"],
    ["i", "am", "going", "to"],
    ["i", "have", "to", "go"],
    ["i", "do", "not", "know"],
    ["i", "do", "not", "think"],
    ["do", "you", "want", "to"],
    ["would", "you", "like", "to"],
    ["could", "you", "please", "help"],
    ["can", "you", "help", "me"],
    ["let", "me", "know", "if"],
    ["how", "are", "you", "doing"],
    ["what", "do", "you", "think"],
    ["what", "do", "you", "want"],
    ["thank", "you", "so", "much"],
    ["thanks", "for", "the", "help"],
    ["that", "sounds", "good", "to"],
    ["that", "makes", "sense", "to"],
    ["by", "the", "way", "i"],
    ["as", "soon", "as", "possible"],
    // 3-grams
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
   * First matching rule wins (order = specificity — put longer contexts first).
   * when:
   *   prev1Empty
   *   prev1..prev4 (exact token)
   *   prev1In..prev4In (membership lists)
   *   prev1Class..prev4Class (WORD_CLASS key)
   * prefer: WORD_CLASS keys and/or short literal words (≤6 chars for candidate expand)
   * Context window: last 4 completed words of the current sentence.
   */
  const SLOT_RULES = [
    // --- 4-word contexts (prev4 … prev1) ---
    { when: { prev4: "i", prev3: "would", prev2: "like", prev1: "to" }, prefer: ["verb", "go", "have", "see", "know"] },
    { when: { prev4: "i", prev3In: ["want", "need"], prev2: "to", prev1In: ["go", "get", "see", "know", "leave"] }, prefer: ["prep", "home", "there", "now", "adv"] },
    { when: { prev4: "would", prev3: "you", prev2: "like", prev1: "to" }, prefer: ["verb", "go", "come", "help", "see"] },
    { when: { prev4: "do", prev3: "you", prev2: "want", prev1: "to" }, prefer: ["verb", "go", "talk", "eat", "rest"] },
    { when: { prev4: "can", prev3: "you", prev2: "help", prev1: "me" }, prefer: ["prep", "with", "please", "verb"] },
    { when: { prev4: "let", prev3: "me", prev2: "know", prev1: "if" }, prefer: ["pron", "det", "you"] },
    { when: { prev4: "i", prev3: "am", prev2: "going", prev1: "to" }, prefer: ["verb", "be", "need", "try"] },
    { when: { prev4: "thank", prev3: "you", prev2: "so", prev1: "much" }, prefer: ["prep", "for", "pron"] },
    { when: { prev4: "how", prev3: "are", prev2: "you", prev1: "doing" }, prefer: ["adv", "today", "now"] },
    { when: { prev4In: ["i", "you", "we", "they"], prev3In: ["do", "does", "did"], prev2: "not", prev1Class: "verb" }, prefer: ["det", "pron", "prep", "adv", "to"] },

    // --- 3-word contexts (prev3 … prev1) ---
    { when: { prev3: "i", prev2: "would", prev1: "like" }, prefer: ["to", "det", "noun", "pron"] },
    { when: { prev3: "i", prev2In: ["want", "need", "like", "have", "got"], prev1: "to" }, prefer: ["verb"] },
    { when: { prev3: "i", prev2In: ["want", "need"], prev1In: ["a", "an", "the", "some"] }, prefer: ["noun", "adj"] },
    { when: { prev3: "i", prev2: "am", prev1: "going" }, prefer: ["to", "home", "adv"] },
    { when: { prev3: "i", prev2: "am", prev1: "not" }, prefer: ["adj", "verb", "adv", "sure"] },
    { when: { prev3: "i", prev2In: ["do", "did"], prev1: "not" }, prefer: ["verb", "know", "want", "like"] },
    { when: { prev3: "i", prev2In: ["have", "had"], prev1: "to" }, prefer: ["verb", "go", "leave"] },
    { when: { prev3: "how", prev2: "are", prev1: "you" }, prefer: ["adj", "doing", "feeling", "today"] },
    { when: { prev3: "how", prev2: "do", prev1: "you" }, prefer: ["verb", "feel", "know", "want"] },
    { when: { prev3: "what", prev2: "do", prev1: "you" }, prefer: ["verb", "want", "think", "need", "mean"] },
    { when: { prev3: "what", prev2: "are", prev1: "you" }, prefer: ["verb", "doing", "thinking"] },
    { when: { prev3: "where", prev2In: ["are", "is", "do", "did"], prev1: "you" }, prefer: ["verb", "going", "from"] },
    { when: { prev3: "when", prev2In: ["do", "did", "are", "is"], prev1: "you" }, prefer: ["verb", "want", "need"] },
    { when: { prev3: "why", prev2In: ["do", "did", "are", "is"], prev1: "you" }, prefer: ["verb", "think", "want"] },
    { when: { prev3: "who", prev2In: ["are", "is", "do", "did"], prev1: "you" }, prefer: ["verb", "with", "talking"] },
    { when: { prev3: "do", prev2: "you", prev1In: ["want", "need", "like", "have", "know", "think"] }, prefer: ["to", "det", "pron", "noun", "verb"] },
    { when: { prev3: "would", prev2: "you", prev1: "like" }, prefer: ["to", "det", "noun", "pron", "some"] },
    { when: { prev3: "could", prev2: "you", prev1: "please" }, prefer: ["verb", "help", "tell", "open"] },
    { when: { prev3: "can", prev2: "you", prev1In: ["help", "tell", "please", "see", "open"] }, prefer: ["pron", "me", "det", "verb"] },
    { when: { prev3: "let", prev2: "me", prev1In: ["know", "see", "try", "think"] }, prefer: ["if", "pron", "det", "verb"] },
    { when: { prev3: "see", prev2: "you", prev1In: ["soon", "later", "tomorrow"] }, prefer: ["pron", "conj", "adv"] },
    { when: { prev3: "thank", prev2: "you", prev1: "so" }, prefer: ["much", "very"] },
    { when: { prev3: "thanks", prev2: "for", prev1: "the" }, prefer: ["noun", "help"] },
    { when: { prev3: "that", prev2: "sounds", prev1: "like" }, prefer: ["det", "noun", "pron", "adj"] },
    { when: { prev3: "that", prev2In: ["sounds", "makes", "seems"], prev1In: ["good", "great", "fine", "sense"] }, prefer: ["prep", "to", "conj", "pron"] },
    { when: { prev3: "i", prev2: "really", prev1In: ["want", "need", "like", "love", "think"] }, prefer: ["to", "det", "pron", "verb"] },
    { when: { prev3In: ["a", "an", "the", "this", "that", "my", "your"], prev2Class: "adj", prev1Class: "noun" }, prefer: ["verb", "prep", "conj", "adv"] },
    { when: { prev3In: ["i", "you", "we", "they", "he", "she"], prev2In: ["am", "is", "are", "was", "were"], prev1Class: "adj" }, prefer: ["prep", "conj", "adv", "to"] },
    { when: { prev3In: ["i", "you", "we", "they"], prev2Class: "modal", prev1: "not" }, prefer: ["verb", "adv"] },
    { when: { prev3: "there", prev2In: ["is", "are"], prev1In: ["a", "an", "some", "no"] }, prefer: ["noun", "adj"] },
    { when: { prev3: "it", prev2In: ["is", "was"], prev1Class: "adj" }, prefer: ["prep", "to", "conj", "adv"] },
    { when: { prev3Class: "pron", prev2Class: "modal", prev1: "to" }, prefer: ["verb"] },

    // --- Bigrams / multi-word ---
    { when: { prev2In: ["want", "need", "like", "love", "prefer", "have", "has", "had", "going", "trying", "looking", "waiting", "used", "ought", "supposed"], prev1: "to" }, prefer: ["verb"] },
    { when: { prev2In: ["going", "looking", "waiting", "ready", "time"], prev1: "for" }, prefer: ["det", "noun", "pron", "verb"] },
    { when: { prev2In: ["i", "you", "we", "they", "he", "she"], prev1In: ["am", "is", "are", "was", "were"] }, prefer: ["adj", "verb", "det", "adv", "not"] },
    { when: { prev2In: ["i", "you", "we", "they", "he", "she"], prev1In: ["do", "does", "did"] }, prefer: ["verb", "not", "pron"] },
    { when: { prev2In: ["i", "you", "we", "they", "he", "she"], prev1In: ["have", "has", "had"] }, prefer: ["verb", "det", "noun", "adv", "not"] },
    { when: { prev2In: ["i", "you", "we", "they"], prev1In: ["will", "would", "can", "could", "should", "might", "must"] }, prefer: ["verb", "not", "adv", "pron"] },
    { when: { prev2: "what", prev1In: ["do", "did", "does", "are", "is", "was", "were", "can", "could", "should", "would"] }, prefer: ["pron", "det", "verb"] },
    { when: { prev2In: ["where", "when", "why", "who"], prev1In: ["do", "did", "does", "are", "is", "was", "were", "can", "could", "should", "would"] }, prefer: ["pron", "det", "verb"] },
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
    { when: { prev2: "would", prev1: "you" }, prefer: ["verb", "like", "please", "mind"] },
    { when: { prev2: "could", prev1: "you" }, prefer: ["verb", "please", "help"] },

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

  /** Log-space chip adjustments (base rank is seed log10). */
  const SCORE_WEIGHTS = {
    exactMatchLog: 0.35,
    prefixGrowLog: 0.08,
    repeatPrevLog: 0.25,
    orthography: 0.55
  };

  const STUPID_BACKOFF_ALPHA = 0.4;

  /** Single lexicon: flat words[] + classes{} (see data/NOTICE-word-class-10k.txt). */
  const WORD_CLASS_URL = "data/word-class-10k.json.gz";
  const LS_PERSONAL_KEY = "voice_predict_personal_v1";
  const LS_PERSONAL_TEXT_KEY = "voice_predict_personal_text_v1";

  /** Max log10 additive from within-class frequency rank (rank 0 gets full boost). */
  const CLASS_FREQ_LOG_BOOST = 0.07;

  const CANDIDATE_LIMIT = 64;
  const CHIP_LIMIT = 9;

  global.VoicePredictData = {
    DEFAULT_STARTERS,
    CONVERSATION_SEED,
    WORD_CLASS,
    SEED_PHRASES,
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
    WORD_CLASS_URL,
    CLASS_FREQ_LOG_BOOST,
    CANDIDATE_LIMIT,
    CHIP_LIMIT,
    LS_PERSONAL_KEY,
    LS_PERSONAL_TEXT_KEY
  };
})(typeof window !== "undefined" ? window : globalThis);
