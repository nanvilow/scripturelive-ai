import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
}

export function SEO({
  title = "ScriptureLive AI | The Sunday-Morning Operator Console",
  description = "Built for Ghanaian churches who livestream — it hears the preacher, finds the verse, and puts it on the screen before the congregation even thinks to look it up.",
  image,
  url = "https://scripturelive.replit.app"
}: SEOProps) {
  const resolvedImage = image ?? `${import.meta.env.BASE_URL}opengraph.jpg`;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={resolvedImage} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={resolvedImage} />
    </Helmet>
  );
}
