const UPSTREAM_HOST = 'pumpkinpatchquilter.com';
const UPSTREAM_PROTOCOL = 'https';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === '/robots.txt') {
    let robotsContent = `User-agent: *\nAllow: /\n\nSitemap: ${UPSTREAM_PROTOCOL}://${UPSTREAM_HOST}/sitemap.xml\n`;
    return new Response(robotsContent, { headers: { "Content-Type": "text/plain" } });
  }

  const upstreamUrl = new URL(url.pathname + url.search, `${UPSTREAM_PROTOCOL}://${UPSTREAM_HOST}`);

  const newRequestHeaders = new Headers(request.headers);
  newRequestHeaders.set('Host', UPSTREAM_HOST);
  newRequestHeaders.set('X-Forwarded-Host', url.hostname);
  newRequestHeaders.set('X-Forwarded-Proto', url.protocol.slice(0, -1));

  let response;
  try {
    response = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers: newRequestHeaders,
      body: request.body,
      redirect: 'manual'
    });

    let newResponseHeaders = new Headers(response.headers);

    newResponseHeaders.set('Access-Control-Allow-Origin', '*');
    newResponseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
    newResponseHeaders.delete('X-Frame-Options');


    if (response.headers.get("Content-Type") && response.headers.get("Content-Type").includes("text/html")) {
      newResponseHeaders.set('X-Robots-Tag', 'noindex, follow');

      const requestPathAndQuery = url.pathname + url.search;
      const canonicalUrl = `${UPSTREAM_PROTOCOL}://${UPSTREAM_HOST}${requestPathAndQuery}`;

      const responseToTransform = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newResponseHeaders
      });

      return new HTMLRewriter()
        .on('head', new CanonicalInjector(canonicalUrl))
        .on('a[href]', new LinkRewriter(url.hostname, UPSTREAM_HOST, UPSTREAM_PROTOCOL))
        .on('img[src]', new LinkRewriter(url.hostname, UPSTREAM_HOST, UPSTREAM_PROTOCOL))
        .on('link[href]', new LinkRewriter(url.hostname, UPSTREAM_HOST, UPSTREAM_PROTOCOL))
        .on('script[src]', new LinkRewriter(url.hostname, UPSTREAM_HOST, UPSTREAM_PROTOCOL))
        .on('form[action]', new LinkRewriter(url.hostname, UPSTREAM_HOST, UPSTREAM_PROTOCOL))
        .transform(responseToTransform);

    } else {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newResponseHeaders
      });
    }

  } catch (e) {
    console.error(`Upstream fetch error for ${upstreamUrl.toString()}: ${e.message}`, e.stack);
    if (e.message.includes('certificate') || e.message.includes('SSL')) {
      return new Response(`Gagal mengambil konten dari ${UPSTREAM_HOST} karena masalah SSL. Error: ${e.message}`, { status: 526 });
    }
    return new Response(`Gagal mengambil konten dari ${UPSTREAM_HOST}. Error: ${e.message}`, { status: 502 });
  }
}

class CanonicalInjector {
  constructor(canonicalUrl) {
    this.canonicalUrl = canonicalUrl;
  }
  element(element) {
    element.append(`<link rel="canonical" href="${this.canonicalUrl}" />`, { html: true });
  }
}

class LinkRewriter {
  constructor(proxyHostname, upstreamHostname, upstreamProtocol) {
    this.proxyHostname = proxyHostname;
    this.upstreamHostname = upstreamHostname;
    this.upstreamProtocol = upstreamProtocol;
    this.attributesToRewrite = ['href', 'src', 'action'];
  }

  element(element) {
    for (const attributeName of this.attributesToRewrite) {
      const attributeValue = element.getAttribute(attributeName);
      if (attributeValue) {
        try {
          let originalUrl = new URL(attributeValue, `${this.upstreamProtocol}://${this.upstreamHostname}`);

          if (originalUrl.hostname === this.upstreamHostname) {
            originalUrl.hostname = this.proxyHostname;
            element.setAttribute(attributeName, originalUrl.toString());
          }
        } catch (e) {
        }
      }
    }
  }
}