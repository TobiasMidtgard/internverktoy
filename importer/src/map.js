import { parseProduct } from './parse.js';

export function normalizeAvailability(a){
  if (!a) return null;
  return String(a).replace(/^https?:\/\/schema\.org\//,'');
}

const OUTLET_RE = /outlet|tilbud/i;
export function detectOutlet(breadcrumb, url){
  return (breadcrumb || []).some(n => OUTLET_RE.test(n)) || OUTLET_RE.test(url || '');
}

export function mapProductToBike(html, { x = 0, y = 0 } = {}){
  const { product, breadcrumb } = parseProduct(html);
  const offer = Array.isArray(product.offers) ? product.offers[0] : (product.offers || {});
  const url = offer.url || product.url || '';
  const image = Array.isArray(product.image) ? product.image[0] : (product.image || null);
  return {
    source_id: String(url.match(/pn(\d+)/)?.[1] || product.sku || product.productID || '').trim(),
    name: String(product.name || '').trim(),
    price: Math.round(parseFloat(offer.price || '0')) || 0,
    frame: String(product.gtin || product.gtin13 || '').trim(),
    availability: normalizeAvailability(offer.availability),
    image_url: image,
    source_url: url,
    outlet: detectOutlet(breadcrumb, url),
    x, y
  };
}
