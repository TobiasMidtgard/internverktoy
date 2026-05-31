// Thansen renders its bike listings client-side via Algolia. We query the SAME public,
// search-only credentials the website exposes in its own page source (NOT secrets), against
// the same index — so this reads exactly what a visitor's browser would, no site scraping.
const APP_ID = 'OD48YHEOTK';
const SEARCH_KEY = '62be5f66604910c596a0da1f567c3237';
const INDEX = 'thansen_no_products';
// Excluded: Rullator (mobility walkers + their spare parts) and Trehjuls Tilbehør (chargers etc.)

export function algoliaUrl(appId = APP_ID, index = INDEX){
  return `https://${appId}-dsn.algolia.net/1/indexes/${index}/query`;
}

// fetchJson(url, options) -> parsed JSON. Injected so tests can stub the network.
export async function fetchBikeHits(fetchJson, { hitsPerPage = 1000 } = {}){
  const body = JSON.stringify({
    query: '', hitsPerPage,
    facetFilters: ['node_tree.name:Sykler'],
    filters: 'NOT al_menu.lvl2:"Sykkel > Sykler > Rullator" AND NOT al_menu.lvl3:"Sykkel > Sykler > Trehjuls & løpesykkel > Tilbehør"'
  });
  const data = await fetchJson(algoliaUrl(), {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': APP_ID,
      'X-Algolia-API-Key': SEARCH_KEY,
      'Content-Type': 'application/json'
    },
    body
  });
  if (!data || !Array.isArray(data.hits)){
    throw new Error('Algolia returned no hits array: ' + ((data && data.message) || 'unknown'));
  }
  return data.hits.filter(h => h && h.url); // all results from this category query are complete bikes
}

export const defaultFetchJson = async (url, opts) => {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Algolia HTTP ${res.status}`);
  return res.json();
};
