import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Helper function to clean the response
const cleanResponse = (text) => {
  // First, check if the text contains any <think> tags
  if (text.includes('<think>')) {
    // Remove everything between and including <think> tags
    const cleanedText = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    // Remove any extra whitespace and normalize line breaks
    return cleanedText.trim().replace(/\n{3,}/g, '\n\n');
  }
  return text.trim();
};

// Add this helper function to clean and extract page names
const extractPageNames = (content) => {
  try {
    // First try direct JSON parse
    const cleaned = content.replace(/^[\s\S]*?\[/, '[').replace(/\][\s\S]*$/, ']');
    const parsed = JSON.parse(cleaned);
    
    // Validate and format the page names
    if (Array.isArray(parsed)) {
      return parsed.map(page => {
        // Convert to string, trim whitespace, and capitalize first letter
        const pageName = String(page).trim();
        return pageName.charAt(0).toUpperCase() + pageName.slice(1).toLowerCase();
      }).filter(page => page.length > 0); // Remove empty strings
    }
  } catch (error) {
    console.error('Error parsing page names:', error);
  }
  
  // Fallback to default pages if parsing fails
  return ["Home", "About", "Services", "Contact"];
};

app.post('/api/generate-prompts', async (req, res) => {
  try {
    console.log('Received request:', req.body);

    const apiResponse = await fetch('https://cloud.olakrutrim.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer nIwaJ8TMVkBY5OopmD4Ep'
      },
      body: JSON.stringify({
        model: "DeepSeek-R1",
        stream: false,
        messages: req.body.messages,
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.text();
      console.error('API Error:', errorData);
      throw new Error(`API responded with status ${apiResponse.status}: ${errorData}`);
    }

    const data = await apiResponse.json();
    console.log('API Response:', data);

    const cleanedContent = cleanResponse(data.choices[0].message.content);

    // Format the response without dummy prompts
    const formattedResponse = {
      mainPrompt: cleanedContent,
      pagePrompts: {}  // Start with empty pagePrompts
    };

    res.json(formattedResponse);
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ 
      error: 'Failed to generate prompts',
      details: error.message 
    });
  }
});

// Update the suggest-pages endpoint to use the new extraction
app.post('/api/suggest-pages', async (req, res) => {
  try {
    console.log('Received request:', req.body);

    if (!req.body.websiteIdea) {
      throw new Error('Missing websiteIdea in request body');
    }

    const apiResponse = await fetch('https://cloud.olakrutrim.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer nIwaJ8TMVkBY5OopmD4Ep'
      },
      body: JSON.stringify({
        model: "DeepSeek-R1",
        stream: false,
        messages: [{
          role: "user",
          content: `Given this website idea: "${req.body.websiteIdea}", suggest a list of essential pages that should be included. IMPORTANT: You must ONLY return a valid JavaScript array like ["home", "about", "blog"]. DO NOT include ANY explanations, markdown, or other text.`
        }],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('API Error:', errorText);
      throw new Error(`API responded with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    console.log('API Response:', data);

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid API response structure');
    }

    const content = data.choices[0].message.content;
    const suggestedPages = extractPageNames(content);
    
    const result = { 
      suggestedPages,
      isDefaultResponse: suggestedPages.length === 4 && suggestedPages[0] === "Home"
    };
    
    console.log('Sending response:', result);
    res.json(result);

  } catch (error) {
    console.error('Error in endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to suggest pages',
      details: error.message 
    });
  }
});

app.post('/api/generate-page-prompt', async (req, res) => {
  try {
    console.log('Generating page prompt for:', req.body);

    if (!req.body.websiteIdea || !req.body.pageName) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        details: 'websiteIdea and pageName are required' 
      });
    }

    const response = await fetch('https://cloud.olakrutrim.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer nIwaJ8TMVkBY5OopmD4Ep'
      },
      body: JSON.stringify({
        model: "DeepSeek-R1",
        stream: false,
        messages: [{
          role: "user",
          content: `Generate a detailed content prompt for the "${req.body.pageName}" page of this website/app idea: "${req.body.websiteIdea}".
                   Include the following sections:
                   1. Page Purpose
                   2. Key Components & Layout
                   3. Content Requirements
                   4. Interactive Elements
                   5. Design Recommendations
                   Format the response with markdown headings and bullet points.`
        }],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();
    console.log('API Response for page prompt:', data);

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from API');
    }

    const cleanedContent = cleanResponse(data.choices[0].message.content);
    
    // Format the response
    const formattedResponse = {
      pagePrompt: cleanedContent,
      pageName: req.body.pageName,
      status: 'success'
    };

    console.log('Sending response:', formattedResponse);
    res.json(formattedResponse);

  } catch (error) {
    console.error('Error generating page prompt:', error);
    res.status(500).json({ 
      error: 'Failed to generate page prompt',
      details: error.message,
      pageName: req.body?.pageName
    });
  }
});

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    details: err.message 
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 