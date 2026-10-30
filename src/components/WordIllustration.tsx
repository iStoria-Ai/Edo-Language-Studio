import React, { useState, useEffect } from 'react';
import {
  getVocabularyImageUrl,
  discoverOnlineVocabularyImage,
  enqueueImageDiscovery,
  subscribeImageUpdates
} from '../services/imageService';
import { normalizeEnglish } from '../services/vocabularyService';

interface WordIllustrationProps {
  id?: string;
  english?: string;
  illustrationKey?: string;
  imageUrl?: string;
  icon?: string;
  emoji?: string;
  size?: 'sm' | 'md' | 'lg' | 'card';
  className?: string;
  allowOnlineDiscovery?: boolean;
  skipLocalCache?: boolean;
}

export const WordIllustration: React.FC<WordIllustrationProps> = ({
  id,
  english,
  illustrationKey,
  imageUrl: initialImageUrl,
  size = 'lg',
  className = '',
  allowOnlineDiscovery = false,
  skipLocalCache = false
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string>(() =>
    getVocabularyImageUrl({ id, english, illustrationKey, imageUrl: initialImageUrl, skipLocalCache })
  );
  const [isLoaded, setIsLoaded] = useState(false);

  // Sync when props change
  useEffect(() => {
    setIsLoaded(false);
    const standardUrl = getVocabularyImageUrl({ id, english, illustrationKey, imageUrl: initialImageUrl, skipLocalCache });
    setResolvedUrl(standardUrl);

    // If it is a dynamic word and not in static curated list, enqueue background discovery
    if (allowOnlineDiscovery && !initialImageUrl && english && english.trim().toLowerCase() !== 'yam' && !standardUrl) {
      enqueueImageDiscovery(english, undefined, id);
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
  }, [id, english, illustrationKey, initialImageUrl, allowOnlineDiscovery, skipLocalCache]);

  // Subscribe to background image updates so this specific card updates automatically without reloading
  useEffect(() => {
    if (!english) return;
    const norm = normalizeEnglish(english);
    return subscribeImageUpdates((updatedNorm, url) => {
      if (norm === updatedNorm && url) {
        setResolvedUrl(url);
      }
    });
  }, [english]);

  const sizeClasses = {
    sm: 'w-10 h-10 rounded-xl',
    card: 'w-full h-full rounded-xl',
    md: 'w-24 h-24 sm:w-28 sm:h-28 rounded-2xl',
    lg: 'w-32 h-32 sm:w-36 sm:h-36 rounded-3xl'
  }[size];

  const handleImageError = () => {
    setResolvedUrl('');
    setIsLoaded(true);
  };

  const altText = english ? `Picture representing ${english}` : 'Vocabulary illustration';

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden shrink-0 select-none bg-[#F4EFE6] border border-[#E2D8C6] shadow-xs ${sizeClasses} ${className}`}
    >
      {resolvedUrl && (
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
      )}
      {!resolvedUrl && (
        <span className="p-2 text-[11px] font-semibold text-center text-[#68766E] leading-tight break-words max-w-full">
          {english || 'No picture'}
        </span>
      )}
      {resolvedUrl && !isLoaded && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#F4EFE6] to-[#EBE4D5] animate-pulse" />
      )}
    </div>
  );
};
