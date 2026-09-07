import { useSearchParams } from 'react-router-dom';
import { usePromptBuilder } from '../../hooks/usePromptBuilder';
import { useAuth } from '../../context/AuthContext';
import MobileBuilder from '../../components/builder/MobileBuilder';

export default function MobileBuilderPage() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'standard';
  const { user } = useAuth();
  const {
    idea,
    setIdea,
    image,
    selectImage,
    clearImage,
    generatedPrompt,
    error,
    isGenerating,
    isPreparingImage,
    generate,
  } = usePromptBuilder();

  return (
    <MobileBuilder
      mode={mode}
      idea={idea}
      setIdea={setIdea}
      image={image}
      selectImage={selectImage}
      clearImage={clearImage}
      isGenerating={isGenerating}
      isPreparingImage={isPreparingImage}
      error={error}
      generate={generate}
      user={user}
      generatedPrompt={generatedPrompt}
    />
  );
}
