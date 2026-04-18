import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateListingInfo(address: string, bedrooms: number, bathrooms: number) {
  const prompt = `Act as a real estate agent. For the property at "${address}" with ${bedrooms} bedrooms and ${bathrooms} bathrooms, generate:
  1. A catchy listing title.
  2. A detailed listing description perfect for a rental site.
  3. A suggested monthly rental price.
  4. Information about nearby schools, gyms, and safety score (estimated).
  5. Other points of interest nearby.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          listingTitle: { type: Type.STRING },
          listingDescription: { type: Type.STRING },
          suggestedPrice: { type: Type.NUMBER },
          neighborhood: {
            type: Type.OBJECT,
            properties: {
              schools: { type: Type.ARRAY, items: { type: Type.STRING } },
              gyms: { type: Type.ARRAY, items: { type: Type.STRING } },
              safetyScore: { type: Type.NUMBER },
              pois: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        },
        required: ["listingTitle", "listingDescription", "suggestedPrice", "neighborhood"]
      }
    }
  });

  return JSON.parse(response.text);
}

export async function getPortfolioInsights(properties: any[]) {
  const prompt = `Act as a senior real estate consultant. Analyze this portfolio of rental properties:
  ${JSON.stringify(properties)}
  
  Based on the property details (bedrooms, bathrooms, location, price), identify current market gaps and provide 3-5 high-impact "Neighbor Comparisons".
  For each recommendation:
  1. Title of the improvement
  2. Context (e.g., "Neighboring 2-BR homes in [Area] usually feature...")
  3. Estimated Value Increase (text like "+5% Appeal" or "+$200/mo potential")
  4. Difficulty (Low/Medium/High)
  
  Focus on the most frequent property types in the portfolio. If the portfolio is small, suggest common trends for their specific locations.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          insights: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                context: { type: Type.STRING },
                valueIncrease: { type: Type.STRING },
                difficulty: { type: Type.STRING, enum: ["Low", "Medium", "High"] }
              },
              required: ["title", "context", "valueIncrease", "difficulty"]
            }
          }
        },
        required: ["insights"]
      }
    }
  });

  return JSON.parse(response.text).insights;
}

export async function searchAddresses(query: string) {
  if (!query || query.length < 3) return [];

  const prompt = `Find 5 real property address suggestions matching this partial search: "${query}". Return only a JSON array of strings, each being a full address.`;

  try {
    const response = await (ai.models as any).generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      tools: [{ googleMaps: {} }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (e) {
    console.warn("Failed to parse address suggestions", e);
    return [];
  }
}

export async function conductInterviewChunk(transcript: { role: string, text: string }[], propertyInfo: any, candidateInfo: any, ownerPrompt?: string) {
  const systemInstruction = `You are the owner of the following rental property:
  ${JSON.stringify(propertyInfo)}
  
  You are interviewing a potential tenant: ${candidateInfo.applicantName}.
  
  Persona & Critical Guidelines:
  - YOU ARE THE HOMEOWNER. NEVER refer to yourself as an AI, automated system, or agent.
  - Use "I", "my", "me" when referring to yourself and the property.
  - Be warm, conversational, and genuinely interested in finding the right person for YOUR home.
  - Use the property information provided below to answer questions naturally. If someone asks "Do you have a gym nearby?", answer as if you live or manage the area (e.g., "Yes, there's a great fitness center just a few blocks away on...").
  - CRITICAL PACING: 
    1. DO NOT ask all your questions at once. Ask exactly ONE question at a time.
    2. Acknowledge the applicant's previous answer before moving to the next topic. 
    3. Topics to cover incrementally throughout the chat:
       - Their current job and how long they've been there.
       - Why they are looking to move right now.
       - If they have any pets (be specific about types/sizes).
       - Their preferred move-in date and rental history.
  - Keep the conversation flowing like a friendly neighbor, not a clinical interview.
  - After you have a good feel for the candidate (usually 5-7 total messages from you), you MUST end the chat with this EXACT phrase: "Thank you so much for chatting with me. I appreciate all the information. I'll take a moment to review everything and get back to you with a decision soon."
  
  ${ownerPrompt ? `IMPORTANT OWNER PREFERENCE: You have personal notes on what to look for/ask this specific candidate: ${ownerPrompt}` : ""}
  
  Transcript so far (Role 'model' is YOU):
  ${transcript.map(t => `${t.role === 'model' ? 'Homeowner' : 'Applicant'}: ${t.text}`).join("\n")}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: "Please provide the next response in the conversation.",
    config: {
      systemInstruction
    }
  });

  return response.text;
}

export async function rateCandidate(transcript: { role: string, text: string }[], candidateData: any, propertyData: any) {
  const prompt = `Act as a professional rental screener. Analyze the interview transcript and candidate data to provide a rental rating (0-100) and feedback.
  
  Property Context: ${JSON.stringify(propertyData)}
  Candidate Data: ${JSON.stringify(candidateData)}
  Transcript: ${transcript.map(t => `${t.role}: ${t.text}`).join("\n")}
  
  Verification & Analysis Protocol:
  1. Identify any inconsistencies in the candidate's story (e.g., job dates not matching moving reasons).
  2. Flag any "red flags" (e.g., avoiding questions about pets, vague job descriptions).
  3. Estimate reliability based on transcript details.
  
  Provide:
  - score: (0-100)
  - feedback: A summary for the landlord including the verification analysis.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          feedback: { type: Type.STRING }
        },
        required: ["score", "feedback"]
      }
    }
  });

  return JSON.parse(response.text);
}
