const { streamText, StreamingTextResponse } = require('ai');

const mockModel = {
  specificationVersion: 'v1',
  provider: 'mock',
  modelId: 'mock-model',
  async doStream() {
    return {
      stream: new ReadableStream(),
      rawCall: { rawPrompt: null, rawSettings: {} }
    };
  }
};

async function run() {
  try {
    const result = await streamText({
      model: mockModel,
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
