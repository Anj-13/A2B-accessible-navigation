# Voice Service Demo Scenario

This demo is designed for hackathon judges. It shows the voice pipeline working end to end with a realistic accessibility and rerouting story:

User voice input -> conversation memory -> Ollama -> assistant response -> ElevenLabs TTS -> output.mp3

The demo should stay short, concrete, and easy to repeat.

## 2-Minute Demonstration Script

**0:00 - 0:15 | Setup**

"I’m going to show the voice-only part of our accessibility-aware navigation assistant. It listens, remembers the current conversation, asks a local Ollama model for help, then speaks the answer back with ElevenLabs."

**0:15 - 0:35 | First user request**

Say to the app:

"I need to get from King’s Cross to the nearest accessible station entrance."

Expected flow:

1. The message is saved to `conversation_history.json`.
2. The message is sent to the local Ollama model.
3. The assistant returns a concise navigation answer.
4. The response is spoken with ElevenLabs and saved as `output.mp3`.

**0:35 - 1:05 | Memory recall**

Say a follow-up:

"Can you use the station we just discussed and keep the route step-free?"

What this demonstrates:

1. The last conversation turns are included in the Ollama prompt.
2. The model can reference earlier context without asking the user to repeat themselves.
3. The assistant response is stored in the same conversation history file.

**1:05 - 1:35 | Accessibility routing**

Say:

"I can’t use stairs. Please prefer lifts and step-free entrances."

What this demonstrates:

1. Accessibility constraints are part of the request.
2. The assistant should prioritize step-free access and avoid stairs.
3. The voice output should confirm the route is accessible.

**1:35 - 2:00 | Rerouting example**

Say:

"If that entrance is closed, reroute me to the next accessible option."

What this demonstrates:

1. The assistant adapts to a changing condition.
2. It can produce a new recommendation without losing the original accessibility requirement.
3. The same voice pipeline handles the updated request.

## Example User Prompts

Use these prompts if you want a clean rehearsal path:

1. "I need to get from King’s Cross to the nearest accessible station entrance."
2. "Can you use the station we just discussed and keep the route step-free?"
3. "I can’t use stairs. Please prefer lifts and step-free entrances."
4. "If that entrance is closed, reroute me to the next accessible option."

## Expected Assistant Responses

These are example responses judges can expect to hear. The exact wording may vary depending on the local Ollama model.

1. "The best option is an accessible route to the station entrance with step-free access. I’ll keep the directions concise and practical."
2. "Yes. Using the station we discussed, I’ll keep the route step-free and avoid stairs."
3. "Understood. I’ll prioritize lifts, accessible entrances, and routes without stairs."
4. "I’m rerouting you to the next accessible entrance and keeping the route step-free."

## Memory Recall Example

This is the key conversation-memory moment:

1. First turn: "I need to get from King’s Cross to the nearest accessible station entrance."
2. Assistant responds and the turn is saved.
3. Second turn: "Can you use the station we just discussed and keep the route step-free?"

Expected behavior:

The assistant should understand that "the station we just discussed" refers to the earlier turn, because the last 5 turns are injected into the Ollama prompt context.

## Accessibility-Routing Example

Prompt:

"I can’t use stairs. Please prefer lifts and step-free entrances."

Expected assistant behavior:

1. Acknowledge the accessibility constraint.
2. Prioritize step-free access.
3. Avoid recommending routes that require stairs.
4. Speak the answer back through ElevenLabs.

## Rerouting Example

Prompt:

"If that entrance is closed, reroute me to the next accessible option."

Expected assistant behavior:

1. Keep the accessibility requirement in the follow-up response.
2. Offer the next best accessible alternative.
3. Return a fresh response while retaining the conversation context.

## Demo Tips

- Keep the pace fast. Judges should see the full pipeline quickly.
- Use the same voice and short prompts for every run.
- If Ollama is unavailable, the app will still save the turn and speak a fallback response.
- If the model is available, point out that the conversation memory is bounded to the last 5 turns.
