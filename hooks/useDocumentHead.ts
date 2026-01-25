import { useEffect } from 'react';

export interface DocumentHeadMetadata {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  ogType?: string;
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
}

/**
 * Hook to manage document head metadata for SEO and social sharing.
 * Similar to Next.js metadata export functionality.
 *
 * @example
 * useDocumentHead({
 *   title: 'Parle - Learn French with AI',
 *   description: 'Practice French conversation with AI tutors',
 *   ogTitle: 'Parle - Learn French with AI',
 *   ogDescription: 'Practice French conversation with AI tutors',
 * });
 */
export const useDocumentHead = (metadata: DocumentHeadMetadata): void => {
  useEffect(() => {
    // Update document title
    document.title = metadata.title;

    // Helper to update or create a meta tag
    const setMetaTag = (
      selector: string,
      attribute: 'name' | 'property',
      attributeValue: string,
      content: string
    ) => {
      let tag = document.querySelector(selector) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attribute, attributeValue);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    // Basic meta tags
    setMetaTag('meta[name="description"]', 'name', 'description', metadata.description);

    // Open Graph tags
    const ogTitle = metadata.ogTitle || metadata.title;
    const ogDescription = metadata.ogDescription || metadata.description;

    setMetaTag('meta[property="og:title"]', 'property', 'og:title', ogTitle);
    setMetaTag('meta[property="og:description"]', 'property', 'og:description', ogDescription);

    if (metadata.ogType) {
      setMetaTag('meta[property="og:type"]', 'property', 'og:type', metadata.ogType);
    }

    if (metadata.ogUrl) {
      setMetaTag('meta[property="og:url"]', 'property', 'og:url', metadata.ogUrl);
    }

    if (metadata.ogImage) {
      setMetaTag('meta[property="og:image"]', 'property', 'og:image', metadata.ogImage);
    }

    // Twitter Card tags
    const twitterCard = metadata.twitterCard || 'summary_large_image';
    const twitterTitle = metadata.twitterTitle || ogTitle;
    const twitterDescription = metadata.twitterDescription || ogDescription;

    setMetaTag('meta[name="twitter:card"]', 'name', 'twitter:card', twitterCard);
    setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', twitterTitle);
    setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', twitterDescription);

    if (metadata.twitterImage || metadata.ogImage) {
      setMetaTag(
        'meta[name="twitter:image"]',
        'name',
        'twitter:image',
        metadata.twitterImage || metadata.ogImage!
      );
    }
  }, [
    metadata.title,
    metadata.description,
    metadata.ogTitle,
    metadata.ogDescription,
    metadata.ogImage,
    metadata.ogUrl,
    metadata.ogType,
    metadata.twitterCard,
    metadata.twitterTitle,
    metadata.twitterDescription,
    metadata.twitterImage,
  ]);
};
