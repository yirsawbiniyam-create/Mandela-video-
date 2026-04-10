import { GoogleGenAI } from "@google/genai";

function getAI() {
  // Try different possible environment variable names
  const apiKey = 
    (process.env as any).API_KEY || 
    (process.env as any).GEMINI_API_KEY || 
    (import.meta as any).env?.VITE_GEMINI_API_KEY;

  if (!apiKey || apiKey === "undefined" || apiKey === "null") {
    throw new Error("የኤፒአይ ቁልፍ አልተገኘም። እባክዎን በ Secrets panel ውስጥ 'API_KEY' በሚል ስም ያስገቡ።");
  }
  return new GoogleGenAI({ apiKey });
}

export async function getVideosOperation(operation: any) {
  const ai = getAI();
  return await ai.operations.getVideosOperation({ operation });
}

export async function generateImage(prompt: string) {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Image generation error:", error);
    throw error;
  }
}

export async function generateVideo(prompt: string, sourceImageBase64?: string) {
  try {
    const ai = getAI();
    const params: any = {
      model: 'veo-3.1-lite-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '1080p',
        aspectRatio: '16:9'
      }
    };

    if (sourceImageBase64) {
      const base64Data = sourceImageBase64.includes(',') 
        ? sourceImageBase64.split(',')[1] 
        : sourceImageBase64;
        
      params.image = {
        imageBytes: base64Data,
        mimeType: "image/png"
      };
    }

    const operation = await ai.models.generateVideos(params);
    return operation;
  } catch (error) {
    console.error("Video generation error:", error);
    throw error;
  }
}
