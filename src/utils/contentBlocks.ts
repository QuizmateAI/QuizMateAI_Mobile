const IMAGE_MARKDOWN_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
const IMAGE_URL_REGEX = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;

export function isImageUrl(url: any, allowAnyHttp = false) {
  if (typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  return allowAnyHttp || IMAGE_URL_REGEX.test(url);
}

function collectCandidateImageUrls(value: any, collector: Set<string>, allowAnyHttp = false) {
  if (!value) return;
  if (typeof value === 'string') {
    if (isImageUrl(value, allowAnyHttp)) {
      collector.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectCandidateImageUrls(item, collector, allowAnyHttp));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach(item => collectCandidateImageUrls(item, collector, allowAnyHttp));
  }
}

export function getSourceImageUrls(source: any, contentBlocks: any[]) {
  if (!source) return [];
  const discovered = new Set<string>();
  const allowAnyHttp = String(source?.type || '').toLowerCase().includes('image');
  const prioritized = [
    source.imageUrl,
    source.thumbnail,
    source.thumbnailUrl,
    source.previewUrl,
    source.fileUrl,
    source.downloadUrl,
    source.materialUrl,
    source.contentUrl,
    source.url,
    source.link,
    source.path,
  ];
  prioritized.forEach(v => collectCandidateImageUrls(v, discovered, allowAnyHttp));
  collectCandidateImageUrls(source, discovered, allowAnyHttp);
  // also add images from contentBlocks
  (contentBlocks || []).forEach((b: any) => {
    if (b?.type === 'image' && b?.url) discovered.add(b.url);
  });
  return [...discovered];
}

export function sanitizeExtractedText(text: any) {
  if (!text) return '';
  return String(text)
    .replace(/\[Phân tích ảnh[\s\S]*?\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildContentBlocks(text: any) {
  const sanitized = sanitizeExtractedText(text);
  if (!sanitized) return [];
  if (isImageUrl(sanitized)) {
    return [{type: 'image', alt: 'Document image', url: sanitized}];
  }
  const blocks: any[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  IMAGE_MARKDOWN_REGEX.lastIndex = 0;
  while ((match = IMAGE_MARKDOWN_REGEX.exec(sanitized)) !== null) {
    const before = sanitized.slice(lastIndex, match.index).trim();
    if (before) blocks.push({type: 'text', value: before});
    blocks.push({type: 'image', alt: match[1] || 'Document image', url: match[2]});
    lastIndex = IMAGE_MARKDOWN_REGEX.lastIndex;
  }
  const tail = sanitized.slice(lastIndex).trim();
  if (tail) blocks.push({type: 'text', value: tail});
  return blocks;
}

export default {
  isImageUrl,
  buildContentBlocks,
  getSourceImageUrls,
  sanitizeExtractedText,
};
