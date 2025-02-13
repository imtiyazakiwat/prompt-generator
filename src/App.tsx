import React, { useState, useCallback } from 'react';
import './App.css';

interface PromptResponse {
  mainPrompt: string;
  pagePrompts: { [key: string]: string };
  suggestedPages?: string[];
}

interface ExpandedPrompt {
  pageName: string;
  content: string;
}

// Helper function to clean the response text
const cleanResponseText = (text: string): string => {
  // Remove everything between <think> tags including the tags
  const cleanedText = text.replace(/<think>[\s\S]*?<\/think>/g, '')
    // Remove any remaining XML/HTML-like tags
    .replace(/<[^>]*>/g, '')
    // Remove multiple consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    // Remove leading/trailing whitespace
    .trim();
  
  return cleanedText;
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <button 
      className={`copy-button ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
};

function App() {
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<PromptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPageName, setNewPageName] = useState('');
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [expandedPrompt, setExpandedPrompt] = useState<ExpandedPrompt | null>(null);
  const [generatingPages, setGeneratingPages] = useState<Set<string>>(new Set());
  const [customPages, setCustomPages] = useState<string[]>([]);

  const generatePrompts = async () => {
    if (!userInput.trim()) {
      setError('Please enter a website or app idea');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // Make parallel requests for main concept and page suggestions
      const [conceptResponse, suggestionsResponse] = await Promise.all([
        fetch('http://localhost:5001/api/generate-prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: "user",
              content: `Generate a comprehensive website/app concept based on this idea: ${userInput}. 
                       Include the following:
                       1. Main concept and overall purpose
                       2. Key features and functionality
                       3. Target audience
                       4. Unique selling points`
            }]
          })
        }),
        fetch('http://localhost:5001/api/suggest-pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ websiteIdea: userInput })
        })
      ]);

      if (!conceptResponse.ok || !suggestionsResponse.ok) {
        throw new Error('Failed to generate content');
      }

      const [conceptData, suggestionsData] = await Promise.all([
        conceptResponse.json(),
        suggestionsResponse.json()
      ]);

      // Remove the dummy prompts
      const formattedResponse = {
        ...conceptData,
        pagePrompts: {},  // Start with empty pagePrompts
        suggestedPages: suggestionsData.suggestedPages
      };

      setResponse(formattedResponse);
    } catch (error) {
      console.error('Error:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const generatePagePrompt = async (pageName: string) => {
    try {
      // Add page to generating set
      setGeneratingPages(prev => new Set(prev).add(pageName));
      
      const response = await fetch('http://localhost:5001/api/generate-page-prompt', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          websiteIdea: userInput,
          pageName: pageName
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || 'Failed to generate page prompt');
      }

      if (!data.pagePrompt) {
        throw new Error('Invalid response format from server');
      }

      setResponse(prev => {
        if (!prev) return null;
        return {
          ...prev,
          pagePrompts: {
            ...prev.pagePrompts,
            [pageName]: cleanResponseText(data.pagePrompt)
          }
        };
      });
      
      setSelectedPages(prev => [...prev, pageName]);
    } catch (error) {
      console.error('Error:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate page prompt');
      // Remove page from selected pages if generation failed
      setSelectedPages(prev => prev.filter(p => p !== pageName));
    } finally {
      // Remove page from generating set
      setGeneratingPages(prev => {
        const next = new Set(prev);
        next.delete(pageName);
        return next;
      });
    }
  };

  const handleAddCustomPage = () => {
    if (newPageName.trim()) {
      const pageName = newPageName.trim();
      setCustomPages(prev => [...prev, pageName]);
      generatePagePrompt(pageName);
      setNewPageName('');
    }
  };

  const handleExpandPrompt = useCallback((pageName: string, content: string) => {
    setExpandedPrompt({ pageName, content });
  }, []);

  const formatResponse = (text: string) => {
    return text.split('---').map((section, index) => {
      const lines = section.trim().split('\n');
      return (
        <div key={index} className="response-section">
          {lines.map((line, lineIndex) => {
            if (line.startsWith('###')) {
              return <h2 key={lineIndex}>{line.replace('###', '').trim()}</h2>;
            } else if (line.startsWith('**') && line.endsWith('**')) {
              return <h3 key={lineIndex}>{line.replace(/\*\*/g, '').trim()}</h3>;
            } else if (line.startsWith('-')) {
              return <li key={lineIndex}>{line.substring(1).trim()}</li>;
            } else if (line.trim()) {
              return <p key={lineIndex}>{line}</p>;
            }
            return null;
          })}
        </div>
      );
    });
  };

  return (
    <div className="App">
      <div className="gradient-background">
        <header className="App-header">
          <h1 className="title">AI Prompt Builder</h1>
          <p className="subtitle">Transform your ideas into detailed prompts</p>
        </header>

        <main className="main-content">
          <div className="input-container">
            <textarea
              className="idea-input"
              placeholder="Describe your website or app idea..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
            />
            <button 
              className="generate-button"
              onClick={generatePrompts}
              disabled={isLoading}
            >
              {isLoading ? 'Generating...' : 'Generate Prompts'}
            </button>
          </div>

          {isLoading && (
            <div className="loading-container">
              <div className="thinking-animation">
                <div className="brain-wave"></div>
                <div className="brain-wave"></div>
                <div className="brain-wave"></div>
              </div>
              <p className="loading-text">AI is crafting your concept...</p>
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {response && !isLoading && (
            <div className="results-container">
              <div className="prompt-card main-prompt">
                <div className="card-header">
                  <h2>Generated Concept</h2>
                  <CopyButton text={response.mainPrompt} />
                </div>
                <div className="formatted-content">
                  {formatResponse(response.mainPrompt)}
                </div>
              </div>
              
              <div className="page-prompts-section">
                <div className="page-suggestions">
                  <h2>Suggested Pages</h2>
                  <div className="suggested-pages-grid">
                    {response.suggestedPages?.map(page => (
                      <button
                        key={page}
                        className={`page-suggestion-button 
                          ${selectedPages.includes(page) ? 'selected' : ''} 
                          ${generatingPages.has(page) ? 'generating' : ''}`}
                        onClick={() => !selectedPages.includes(page) && !generatingPages.has(page) && generatePagePrompt(page)}
                        disabled={selectedPages.includes(page) || generatingPages.has(page)}
                      >
                        {page}
                        {generatingPages.has(page) && (
                          <div className="page-generating-indicator">
                            <div className="dot"></div>
                            <div className="dot"></div>
                            <div className="dot"></div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="custom-pages-section">
                    <h3>Custom Pages</h3>
                    <div className="custom-pages-grid">
                      {customPages.map(page => (
                        <button
                          key={page}
                          className={`page-suggestion-button 
                            ${selectedPages.includes(page) ? 'selected' : ''} 
                            ${generatingPages.has(page) ? 'generating' : ''}`}
                          disabled={selectedPages.includes(page) || generatingPages.has(page)}
                        >
                          {page}
                          {generatingPages.has(page) && (
                            <div className="page-generating-indicator">
                              <div className="dot"></div>
                              <div className="dot"></div>
                              <div className="dot"></div>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="custom-page-input">
                    <input
                      type="text"
                      value={newPageName}
                      onChange={(e) => setNewPageName(e.target.value)}
                      placeholder="Enter custom page name..."
                      className="page-name-input"
                    />
                    <button
                      className="add-page-button"
                      onClick={handleAddCustomPage}
                      disabled={!newPageName.trim()}
                    >
                      Add Page
                    </button>
                  </div>
                </div>

                <div className="generated-pages">
                  <h2>Generated Page Prompts</h2>
                  <div className="page-prompts-grid">
                    {Object.entries(response.pagePrompts).map(([page, prompt]) => (
                      <div 
                        key={page} 
                        className="prompt-card page-prompt-card"
                        onClick={() => handleExpandPrompt(page, prompt)}
                      >
                        <div className="card-header">
                          <h3>{page.charAt(0).toUpperCase() + page.slice(1)}</h3>
                          <CopyButton text={prompt} />
                        </div>
                        <div className="formatted-content preview">
                          {formatResponse(prompt)}
                        </div>
                        <div className="card-footer">
                          <span className="expand-hint">Click to expand</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {expandedPrompt && (
        <div className="modal-overlay" onClick={() => setExpandedPrompt(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{expandedPrompt.pageName.charAt(0).toUpperCase() + expandedPrompt.pageName.slice(1)}</h2>
              <button className="close-button" onClick={() => setExpandedPrompt(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="formatted-content">
                {formatResponse(expandedPrompt.content)}
              </div>
            </div>
            <div className="modal-footer">
              <CopyButton text={expandedPrompt.content} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
