import Image from 'next/image';

interface BrowserFrameProps {
  src: string;
  alt: string;
  url?: string;
  width?: number;
  height?: number;
}

export function BrowserFrame({ src, alt, url = 'my.orbo.ru', width, height }: BrowserFrameProps) {
  return (
    <div className="browser-frame">
      <div className="browser-frame__header">
        <div className="browser-frame__dots">
          <span className="browser-frame__dot browser-frame__dot--red" />
          <span className="browser-frame__dot browser-frame__dot--yellow" />
          <span className="browser-frame__dot browser-frame__dot--green" />
        </div>
        <div className="browser-frame__url">
          <svg className="browser-frame__url-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          <span>{url}</span>
        </div>
      </div>
      <div className="browser-frame__content">
        <Image 
          src={src} 
          alt={alt}
          width={width || 1200}
          height={height || 700}
          style={{ width: '100%', height: 'auto' }}
        />
      </div>
    </div>
  );
}

export default BrowserFrame;
