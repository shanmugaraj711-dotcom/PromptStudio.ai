import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ResultCard from '../../pages/Result/ResultCard';
import '../../styles/forge-mobile.css';

export default function MobileBuilder({
  mode,
  idea,
  setIdea,
  image,
  selectImage,
  clearImage,
  isGenerating,
  isPreparingImage,
  error,
  generate,
  user,
  generatedPrompt,
}) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const isImage = mode === 'image';

  const handleFileChange = (event) => {
    const [file] = event.target.files || [];
    if (file) selectImage(file);
    event.target.value = '';
  };

  return (
    <section className="mobile-create-screen">
      <div className="mobile-create-topbar">
        <button type="button" onClick={() => navigate('/')} className="mobile-back-button" aria-label="Back to home">←</button>
        <div>
          <p className="mobile-screen-kicker">Create</p>
          <h1>{isImage ? 'Image → Prompt' : 'New Prompt'}</h1>
        </div>
      </div>

      <div className="mobile-create-content">
        {isImage && (
          <div className="mobile-upload-area">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            {image ? (
              <div className="mobile-image-preview-wrap">
                <img src={`data:${image.mimeType};base64,${image.data}`} alt="Reference preview" className="mobile-image-preview" />
                <div className="mobile-upload-meta">
                  <p>{image.name}</p>
                  <button type="button" onClick={clearImage} disabled={isGenerating} className="mobile-secondary-action">Remove</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isPreparingImage} className="mobile-upload-button">
                <span className="mobile-upload-icon">＋</span>
                <span>
                  <strong>{isPreparingImage ? 'Preparing image…' : 'Add a reference image'}</strong>
                  <small>Screenshot, photo or design</small>
                </span>
              </button>
            )}
          </div>
        )}

        <label className="mobile-idea-field">
          <span>{isImage ? 'What are you creating?' : 'What do you want to create?'}</span>
          <textarea
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder={isImage ? 'Describe what you want the AI to create…' : 'Describe your idea…'}
            rows={5}
            disabled={isGenerating || isPreparingImage}
          />
        </label>

        {!user && (
          <p className="mobile-signin-note">Sign in is required to generate. Your idea stays here while you sign in.</p>
        )}

        {error && <div className="mobile-create-error" role="alert">{error}</div>}

        <button type="button" onClick={generate} disabled={isGenerating || isPreparingImage} className="mobile-generate-button">
          {isGenerating ? 'Generating…' : 'Generate'}
          {!isGenerating && <span aria-hidden="true">→</span>}
        </button>

        {generatedPrompt && (
          <div className="mobile-result-card">
            <div className="mobile-result-heading">Your prompt</div>
            <ResultCard prompt={generatedPrompt} userPlan="free" />
          </div>
        )}
      </div>
    </section>
  );
}
