import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

const STYLE = `
Write a concise production-ready MiniMax H3 prompt for the user's ComfyUI Ref workflow.

Use this structure exactly:

subject_definitions:
<Subject 1> is the person defined by <Picture 1> and <Picture 2>. Preserve identity, appearance, clothing, and environment supported by the supplied frames.
<Picture 1> defines the opening pose, framing, expression, and scene.
<Picture 2> defines the final pose, framing, expression, and scene.
<Video 1> is the source performance video and defines motion, timing, facial expressions, gaze, head/body movement, hand/arm gestures, camera behavior, and pacing.
<Audio 1> is the synchronized soundtrack from <Video 1>.

summary:
[video editing + keyframe guidance + audio reuse] ...

retention_analysis:
<Subject 1>: fully_preserved - ...
<Picture 1>: fully_preserved - ...
<Picture 2>: fully_preserved - ...
<Video 1>: fully_preserved - ...
<Audio 1>: fully_copy - reuse <Audio 1> 1:1 as the complete final soundtrack.

detailed_description:
Describe the visible performance chronologically and compactly. Infer the major action sequence from the supplied timeline samples. Use timing ranges only when they are reasonably supported by the samples.

Rules:
- Do not invent lyrics, dialogue, or audio content.
- Do not claim to have listened to the audio.
- Emphasize matching <Video 1> chronologically.
- Avoid invented, delayed, or repeated gestures.
- Preserve the user's first and last frame intent.
- Keep appearance description concise because the frames already establish it.
- Include natural blinking, breathing, hair/clothing physics, and subtle camera movement when appropriate.
- End with concise negatives such as no morphing, extra fingers/limbs, sudden clothing changes, scene changes, or invented actions.
- Output only the MiniMax H3 prompt.
`.trim();

app.post("/api/generate-prompt", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Server is missing OPENAI_API_KEY." });
    }

    const {
      duration, width, height, firstFrame, lastFrame,
      samples = [], notes = "", recommendedH3
    } = req.body || {};

    if (!firstFrame || !lastFrame) {
      return res.status(400).json({ error: "First and last frame images are required." });
    }

    const content = [
      {
        type: "input_text",
        text: `Create a MiniMax H3 prompt for this reference video.

Video metadata:
- Duration: ${Number(duration || 0).toFixed(2)} seconds
- Resolution: ${width || "unknown"} x ${height || "unknown"}
${recommendedH3 ? `- Closest H3 duration: ${Number(recommendedH3.seconds).toFixed(3)} s (${recommendedH3.frames} frames at 24 fps)` : ""}

User notes:
${notes?.trim() || "None."}

The first supplied image is <Picture 1>.
The second supplied image is <Picture 2>.
The remaining images are chronological samples from <Video 1>.
<Video 1> is the original reference performance video.
<Audio 1> is the soundtrack paired with <Video 1>.`
      },
      { type: "input_image", image_url: firstFrame, detail: "high" },
      { type: "input_image", image_url: lastFrame, detail: "high" }
    ];

    for (const sample of samples.slice(0, 10)) {
      if (!sample?.dataUrl) continue;
      content.push({
        type: "input_text",
        text: `Timeline sample at approximately ${Number(sample.time).toFixed(2)} seconds:`
      });
      content.push({ type: "input_image", image_url: sample.dataUrl, detail: "low" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: "gpt-5.6-sol",
      reasoning: { effort: "medium" },
      store: false,
      input: [
        { role: "developer", content: [{ type: "input_text", text: STYLE }] },
        { role: "user", content }
      ]
    });

    res.json({ prompt: response.output_text || "" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Prompt generation failed." });
  }
});

app.get("/health", (_, res) => res.json({ ok: true }));
app.get("*", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Running on port ${port}`));
