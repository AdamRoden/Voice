/**
 * Built-in boards. topics.js builds the live topics from this list.
 * account-sync.js uses the same list to tell a fresh device from a custom one.
 */
(function (root, factory) {
  "use strict";
  const boards = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = boards;
  root.AacStarterBoards = boards;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  return [
    {
      id: "starter-everyday",
      name: "Everyday",
      icon: "chat",
      color: "#8ab4f8",
      phrases: [
        { label: "Hello", symbol: "waving_hand", text: "Hello" },
        { label: "How are you?", symbol: "chat", text: "How are you?" },
        { label: "Yes", symbol: "thumb_up", text: "Yes" },
        { label: "No", symbol: "thumb_down", text: "No" },
        { label: "Please", symbol: "front_hand", text: "Please" },
        { label: "Thank you", symbol: "favorite", text: "Thank you" },
        { label: "You're welcome", symbol: "volunteer_activism", text: "You're welcome" },
        { label: "Sorry", symbol: "sentiment_dissatisfied", text: "I'm sorry" },
        { label: "Wait", symbol: "hourglass_empty", text: "Please wait" },
        { label: "More", symbol: "add", text: "More please" },
        { label: "Stop", symbol: "stop_circle", text: "Stop" },
        { label: "Don't know", symbol: "help", text: "I don't know" }
      ]
    },
    {
      id: "starter-needs",
      name: "Needs",
      icon: "medical_services",
      color: "#f2b8b5",
      phrases: [
        { label: "Help", symbol: "emergency_home", text: "I need help" },
        { label: "I'm OK", symbol: "sentiment_satisfied", text: "I'm okay" },
        { label: "Bathroom", symbol: "wc", text: "I need the bathroom" },
        { label: "Water", symbol: "water_drop", text: "I would like some water" },
        { label: "Hungry", symbol: "restaurant", text: "I'm hungry" },
        { label: "Thirsty", symbol: "local_cafe", text: "I'm thirsty" },
        { label: "Pain", symbol: "healing", text: "I'm in pain" },
        { label: "Tired", symbol: "bed", text: "I'm tired" },
        { label: "Cold", symbol: "ac_unit", text: "I'm cold" },
        { label: "Hot", symbol: "thermometer", text: "I'm hot" },
        { label: "Medicine", symbol: "medication", text: "I need my medicine" },
        { label: "Break", symbol: "pause_circle", text: "I need a break" }
      ]
    },
    {
      id: "starter-feelings",
      name: "Feelings",
      icon: "sentiment_satisfied",
      color: "#81c784",
      phrases: [
        { label: "Happy", symbol: "sentiment_satisfied", text: "I'm happy" },
        { label: "Sad", symbol: "sentiment_dissatisfied", text: "I'm sad" },
        { label: "Angry", symbol: "priority_high", text: "I'm angry" },
        { label: "Scared", symbol: "visibility", text: "I'm scared" },
        { label: "Worried", symbol: "psychology", text: "I'm worried" },
        { label: "Excited", symbol: "celebration", text: "I'm excited" },
        { label: "Frustrated", symbol: "bolt", text: "I'm frustrated" },
        { label: "Bored", symbol: "hourglass_empty", text: "I'm bored" },
        { label: "Lonely", symbol: "person", text: "I feel lonely" },
        { label: "Love you", symbol: "favorite", text: "I love you" },
        { label: "Confused", symbol: "help", text: "I'm confused" },
        { label: "Calm", symbol: "spa", text: "I feel calm" }
      ]
    }
  ];
});
