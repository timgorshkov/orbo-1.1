import Image from 'next/image';

interface PhoneFrameProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export function PhoneFrame({ src, alt, width, height }: PhoneFrameProps) {
  return (
    <div className="phone-frame">
      <div className="phone-frame__notch" />
      <div className="phone-frame__screen">
        <Image 
          src={src} 
          alt={alt}
          width={width || 375}
          height={height || 812}
          style={{ width: '100%', height: 'auto' }}
        />
      </div>
    </div>
  );
}

export default PhoneFrame;
