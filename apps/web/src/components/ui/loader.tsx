import { BusFront } from 'lucide-react';
import ThemeSwitcher from '@/components/app-header/theme-switcher';
import './loader.css';

export const Loading = ({ fullScreen = false }: { fullScreen?: boolean }) => {
  return (
    <div className={`mms-loading ${fullScreen ? 'mms-loading--full' : ''}`}>
      {fullScreen && (
        <header className="mms-loading-header">
          <div className="mms-loading-brand">
            <img src="/logo/mms-logo.png" alt="" width="40" height="40" />
            <span>
              MMS <span className="mms-loading-brand-divider">/</span> Motorpool
            </span>
          </div>
          <ThemeSwitcher />
        </header>
      )}

      <div className="mms-loading-content">
        <div className="mms-loading-art" aria-hidden="true">
          <svg className="mms-loading-map" viewBox="0 0 360 180" fill="none">
            <g className="mms-loading-map-lines" stroke="currentColor">
              <path d="M0 44H90Q112 44 112 22V0M0 60H94Q128 60 128 26V0M232 180V152Q232 130 254 130H360M248 180V156Q248 146 258 146H360" />
              <rect x="28" y="88" width="48" height="36" rx="6" />
              <rect x="284" y="48" width="48" height="36" rx="6" />
              <path d="M52 88V124M28 106H76M308 48V84M284 66H332M156 18H204M180 6V30M156 156H204M180 144V168" />
            </g>
            <path
              className="mms-loading-route-track"
              d="M24 150H94Q112 150 112 132V108Q112 90 132 90H228Q248 90 248 72V48Q248 30 266 30H336"
            />
            <path
              className="mms-loading-route-signal"
              pathLength="100"
              d="M24 150H94Q112 150 112 132V108Q112 90 132 90H228Q248 90 248 72V48Q248 30 266 30H336"
            />
            <circle className="mms-loading-stop" cx="24" cy="150" r="5" />
            <circle className="mms-loading-stop" cx="336" cy="30" r="5" />
          </svg>
          <div className="mms-loading-vehicle">
            <BusFront size={34} strokeWidth={1.5} />
          </div>
        </div>

        <div role="status" aria-live="polite" className="mms-loading-copy">
          <p className="mms-loading-eyebrow">Motorpool Management System</p>
          <h1 className="mms-loading-title">
            {fullScreen ? 'Getting things in motion.' : 'Loading your page…'}
          </h1>
          <p className="mms-loading-description">
            {fullScreen
              ? 'Preparing your workspace. Please wait a moment.'
              : 'Getting everything ready for you.'}
          </p>
        </div>

        <div className="mms-loading-progress" aria-hidden="true">
          <span />
        </div>
      </div>

      {fullScreen && (
        <footer className="mms-loading-footer">
          University of Mindanao
          <span>Built for the journeys that matter.</span>
        </footer>
      )}
    </div>
  );
};
