import React, { useState, useEffect } from 'react';
import { getVocabularyImageUrl, discoverOnlineVocabularyImage } from '../services/imageService';

interface WordIllustrationProps {
  id?: string;
  english?: string;
  illustrationKey?: string;
  imageUrl?: string;
  icon?: string;
  emoji?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const WordIllustration: React.FC<WordIllustrationProps> = ({
  id,
  english,
  illustrationKey,
  imageUrl: initialImageUrl,
  size = 'lg',
  className = ''
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string>(() =>
    getVocabularyImageUrl({ id, english, illustrationKey, imageUrl: initialImageUrl })
  );
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Sync when props change
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
    const standardUrl = getVocabularyImageUrl({ id, english, illustrationKey, imageUrl: initialImageUrl });
    setResolvedUrl(standardUrl);

    // If it's a dynamic word and not in static curated list, try discovering an online licensed photo
    if (!initialImageUrl && english && standardUrl.includes('edo-welcome-hero')) {
      let active = true;
      discoverOnlineVocabularyImage(english).then(discovered => {
        if (active && discovered) {
          setResolvedUrl(discovered);
        }
      });
      return () => {
        active = false;
      };
    }
  }, [id, english, illustrationKey, initialImageUrl]);

  const sizeClasses = {
    sm: 'w-10 h-10 rounded-xl',
    md: 'w-24 h-24 sm:w-28 sm:h-28 rounded-2xl',
    lg: 'w-44 h-44 sm:w-52 sm:h-52 rounded-3xl'
  }[size];

  const handleImageError = () => {
    if (!hasError) {
      setHasError(true);
      try {
        const base = import.meta.env?.BASE_URL || '/';
        const cleanBase = base.endsWith('/') ? base : `${base}/`;
        setResolvedUrl(`${cleanBase}assets/edo-welcome-hero.jpg`);
      } catch (_) {}
    }
  };

  const altText = english ? `Photograph representing ${english}` : 'Vocabulary illustration';

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden shrink-0 select-none bg-[#F4EFE6] border border-[#E2D8C6] shadow-xs ${sizeClasses} ${className}`}
    >
      <img
        src={resolvedUrl}
        alt={altText}
        loading={size === 'sm' ? 'lazy' : 'eager'}
        onError={handleImageError}
        onLoad={() => setIsLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {!isLoaded && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#F4EFE6] to-[#EBE4D5] animate-pulse" />
      )}
    </div>
  );
};
