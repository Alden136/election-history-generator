import { useState } from 'react';
import { Icon } from './Icon';

/** A small download button that builds and saves a picture, showing when it is busy or failed. */
export function SaveImageButton({ what, save }: { what: string; save: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle');
  const title = state === 'saving' ? 'Saving image…' : state === 'failed' ? 'The image could not be saved. Try again.' : `Save ${what} as an image`;
  return <button type="button" className="icon-button save-image" data-state={state} aria-label={title} title={title}
    disabled={state === 'saving'} onClick={async () => {
      setState('saving');
      try {
        await save();
        setState('idle');
      } catch {
        setState('failed');
      }
    }}><Icon name={state === 'failed' ? 'close' : 'download'} size={15} /></button>;
}
