const { streamText, StreamingTextResponse } = require('ai');
const { createOpenAI } = require('@ai-sdk/openai');

const deepseek = createOpenAI({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: "dummy",
});

async function run() {
  try {
    const result = await streamText({
      model: deepseek("deepseek-chat"),
      prompt: "hi"
    });
    console.log("Result keys:", Object.keys(result));
    console.log("toAIStream exists?", typeof result.toAIStream);
    console.log("toDataStreamResponse exists?", typeof result.toDataStreamResponse);
    console.log("toTextStreamResponse exists?", typeof result.toTextStreamResponse);
  } catch (e) {
    console.error(e);
  }
}
run();
