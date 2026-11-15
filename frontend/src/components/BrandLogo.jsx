export default function BrandLogo({ className = "" }) {
  return (
    <img
      className={`brand-logo-image ${className}`.trim()}
      src="/pagecrew-logo.png"
      alt="PageCrew logo"
    />
  );
}
