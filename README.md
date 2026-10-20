# MiniMax H3 Reference Helper — Render-ready

This project is ready for Render.

## What it does
- Drag/drop a reference video
- Extract and download the first frame
- Extract and download the last frame
- Sample 8 timeline frames
- Show the nearest valid H3 `17k + 5` duration at 24 fps
- Generate the MiniMax H3 prompt style with GPT-5.6 Sol

## Easiest deployment
1. Put this folder in a GitHub repository.
2. In Render, choose **New → Blueprint** and select that repository.
3. When Render asks for `OPENAI_API_KEY`, paste your OpenAI API key.
4. Deploy.

`render.yaml` handles the build and start commands automatically.

The full reference video is processed in the user's browser; only extracted still frames are sent to the server for prompt generation.
