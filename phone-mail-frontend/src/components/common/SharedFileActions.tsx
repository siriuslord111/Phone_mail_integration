import { Download, Eye } from 'lucide-react';
import { useState } from 'react';
import { downloadAttachment, isPreviewableAttachment, openAttachment } from '../../api/email.api';
import { getErrorMessage } from '../../api/axios';
import { useLanguage } from '../../context/LanguageProvider';
import type { Attachment } from '../../types';

export function SharedFileActions({ attachment }: { attachment: Attachment }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState<'open' | 'download' | null>(null);
  const [error, setError] = useState('');
  const available = Boolean(attachment.url);

  const runAction = async (action: 'open' | 'download') => {
    setBusy(action);
    setError('');
    try {
      if (action === 'open') await openAttachment(attachment.id, attachment.name);
      else await downloadAttachment(attachment.id, attachment.name);
    } catch (actionError) {
      setError(getErrorMessage(actionError, action === 'open' ? t('couldNotOpenAttachment') : t('couldNotDownloadAttachment')));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-w-0 shrink-0 flex-col items-end">
      <div className="flex items-center gap-1">
        {!available ? (
          <span className="text-xs text-slate-400">{t('sharedFileUnavailable')}</span>
        ) : (
          <>
            {isPreviewableAttachment(attachment) && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void runAction('open');
                }}
                disabled={busy !== null}
                aria-label={`${t('openAttachment')} ${attachment.name}`}
                title={t('openAttachment')}
                className="grid size-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
              >
                <Eye className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void runAction('download');
              }}
              disabled={busy !== null}
              aria-label={`${t('downloadAttachment')} ${attachment.name}`}
              title={t('downloadAttachment')}
              className="grid size-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
            >
              <Download className="size-4" />
            </button>
          </>
        )}
      </div>
      {error && <p role="alert" className="max-w-48 text-right text-xs text-rose-600">{error}</p>}
    </div>
  );
}
