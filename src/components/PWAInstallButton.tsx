import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  MoreVertical,
  PlusSquare,
  QrCode,
  RefreshCw,
  Share,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'card';
  onInstalled?: () => void;
}

function deriveShareableUrls(originUrl: string, serverAppUrl: string) {
  const base = (originUrl || serverAppUrl || '').replace(/\/+$/, '');
  const isDevStudioUrl = /^https:\/\/ais-dev-/.test(base);
  const publicBase = isDevStudioUrl
    ? base.replace(/^https:\/\/ais-dev-/, 'https://ais-pre-')
    : base;

  return {
    directOpenUrl: base ? `${base}/?install=1` : '',
    publicShareUrl: publicBase ? `${publicBase}/?install=1` : '',
    isDevStudioUrl,
  };
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  onInstalled,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [serverAppUrl, setServerAppUrl] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { appUrl?: string } | null) => {
        if (active && data?.appUrl) {
          setServerAppUrl(data.appUrl);
        }
      })
      .catch(() => {
        // Ignore offline errors
      });
    return () => {
      active = false;
    };
  }, []);

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const { directOpenUrl, publicShareUrl, isDevStudioUrl } = useMemo(
    () => deriveShareableUrls(currentOrigin, serverAppUrl),
    [currentOrigin, serverAppUrl],
  );

  const handlePrimaryClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) {
        onInstalled?.();
        return;
      }
    }
    setShowModal(true);
  };

  if (variant === 'card') {
    return (
      <>
        <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/70 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-slate-900">
                {isInstalled
                  ? 'Chia sẻ link tải App cho người khác'
                  : 'Cài đặt thành App & Gửi link tải'}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                {isInstalled
                  ? 'Bạn đang dùng phiên bản App. Mở bảng bên dưới để sao chép link hoặc lấy mã QR gửi cho nhân sự tải về máy.'
                  : 'Lấy link tải trực tiếp, quét mã QR bằng điện thoại hoặc cài đặt Công Nhật Pro ra màn hình chính.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={handlePrimaryClick}
                className="flex-1 min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Cài App ngay</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className={`flex-1 min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors shadow-xs ${
                !isInstalled && !isInstallable
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300'
              }`}
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span>{isInstalled ? 'Lấy link & QR chia sẻ' : 'Link tải & Mã QR'}</span>
            </button>
          </div>
        </div>

        {showModal && (
          <InstallAndShareModal
            isInstalled={isInstalled}
            isInstallable={isInstallable}
            isIOS={isIOS}
            isAndroid={isAndroid}
            directOpenUrl={directOpenUrl}
            publicShareUrl={publicShareUrl}
            isDevStudioUrl={isDevStudioUrl}
            onInstall={handlePrimaryClick}
            onClose={() => setShowModal(false)}
          />
        )}
      </>
    );
  }

  // Header variant: visible so the user can always install or get the shareable download link
  // Auto-hides install button when running inside installed standalone PWA
  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="min-h-[42px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
        title="Cài đặt App về máy hoặc gửi link cho người khác"
      >
        <Download className="w-4 h-4 text-blue-600 shrink-0" />
        <span>Tải App</span>
      </button>

      {showModal && (
        <InstallAndShareModal
          isInstalled={isInstalled}
          isInstallable={isInstallable}
          isIOS={isIOS}
          isAndroid={isAndroid}
          directOpenUrl={directOpenUrl}
          publicShareUrl={publicShareUrl}
          isDevStudioUrl={isDevStudioUrl}
          onInstall={handlePrimaryClick}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};

interface InstallAndShareModalProps {
  isInstalled: boolean;
  isInstallable: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  directOpenUrl: string;
  publicShareUrl: string;
  isDevStudioUrl: boolean;
  onInstall: () => Promise<void>;
  onClose: () => void;
}

const InstallAndShareModal: React.FC<InstallAndShareModalProps> = ({
  isInstalled,
  isInstallable,
  isIOS,
  isAndroid,
  directOpenUrl,
  publicShareUrl,
  isDevStudioUrl,
  onInstall,
  onClose,
}) => {
  // Default to the live running URL until we confirm the public Share URL is published (not 404)
  const [selectedLinkMode, setSelectedLinkMode] = useState<'public' | 'current'>(
    isDevStudioUrl ? 'current' : 'public',
  );
  const [publicReady, setPublicReady] = useState<boolean | null>(
    isDevStudioUrl ? null : true,
  );
  const [checkingShare, setCheckingShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [inIframe, setInIframe] = useState(false);

  const activeShareUrl =
    selectedLinkMode === 'public' ? publicShareUrl : directOpenUrl;

  const checkPublicShareStatus = useCallback(
    async (autoSelectIfReady: boolean) => {
      if (!isDevStudioUrl || !directOpenUrl) return;
      setCheckingShare(true);
      try {
        const res = await fetch('/api/share-status');
        if (res.ok) {
          const data = (await res.json()) as { publicReady?: boolean };
          const ready = Boolean(data.publicReady);
          setPublicReady(ready);
          if (autoSelectIfReady && ready) {
            setSelectedLinkMode('public');
          } else if (!ready) {
            setSelectedLinkMode('current');
          }
        }
      } catch {
        setPublicReady(false);
      } finally {
        setCheckingShare(false);
      }
    },
    [directOpenUrl, isDevStudioUrl],
  );

  useEffect(() => {
    checkPublicShareStatus(true);
  }, [checkPublicShareStatus]);

  useEffect(() => {
    try {
      setInIframe(window.self !== window.top);
    } catch {
      setInIframe(true);
    }
  }, []);

  useEffect(() => {
    if (!activeShareUrl) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(activeShareUrl, {
      width: 440,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [activeShareUrl]);

  const handleCopyLink = async () => {
    if (!activeShareUrl) return;
    try {
      await navigator.clipboard.writeText(activeShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const input = document.createElement('input');
      input.value = activeShareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    if (!activeShareUrl) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Công Nhật Pro — Chấm công & Lương',
          text: 'Mở link này bằng Chrome (Android) hoặc Safari (iPhone) để cài ứng dụng Công Nhật Pro về điện thoại:',
          url: activeShareUrl,
        });
        return;
      } catch {
        // User cancelled or share unsupported in iframe -> fall back to copy
      }
    }
    await handleCopyLink();
  };

  const handleDownloadQR = async () => {
    if (!qrDataUrl) return;
    try {
      const res = await fetch(qrDataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'CongNhatPro_QR_TaiApp.png', { type: 'image/png' });
      if (isIOS && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Mã QR tải Công Nhật Pro',
        });
        return;
      }
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'CongNhatPro_QR_TaiApp.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    } catch {
      const a = document.createElement('a');
      a.href = qrDataUrl;
      a.download = 'CongNhatPro_QR_TaiApp.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tải về máy và chia sẻ link ứng dụng"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full sm:max-w-lg h-[90dvh] sm:h-auto sm:max-h-[88dvh] rounded-t-2xl sm:rounded-xl border border-slate-200 shadow-2xl flex flex-col min-h-0 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900 truncate">
                Tải App &amp; Gửi link cài đặt
              </h3>
              <p className="text-xs text-slate-500 truncate">
                Cài trực tiếp lên màn hình chính điện thoại
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 shrink-0"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-5 space-y-4 text-sm text-slate-700">
          {/* 1. Share Link & QR Code */}
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Share2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Link &amp; Mã QR tải App</span>
              </div>
              {isDevStudioUrl && (
                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => setSelectedLinkMode('current')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      selectedLinkMode === 'current'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Link đang chạy
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLinkMode('public')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      selectedLinkMode === 'public'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Link công khai
                  </button>
                </div>
              )}
            </div>

            {isDevStudioUrl && publicReady === false && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    {selectedLinkMode === 'current' ? (
                      <>
                        Mã QR hiện đang trỏ tới <strong>Link đang chạy</strong> để bạn quét mở ngay trên máy mình.{' '}
                        <strong>Link công khai</strong> (cho người khác mở) hiện đang báo 404 vì chưa bấm <strong>Share / Publish App</strong> trên AI Studio.
                      </>
                    ) : (
                      <>
                        <strong>Link công khai đang báo 404</strong> nên quét QR này sẽ bị lỗi! Hãy bấm nút <strong>Share App</strong> ở góc trên AI Studio rồi bấm kiểm tra lại, hoặc chuyển sang <strong>Link đang chạy</strong> để quét trên điện thoại của bạn.
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <button
                    type="button"
                    onClick={() => checkPublicShareStatus(true)}
                    disabled={checkingShare}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-amber-100/60 border border-amber-300 rounded-md text-[11px] font-semibold text-amber-900 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3 h-3 ${checkingShare ? 'animate-spin' : ''}`} />
                    <span>{checkingShare ? 'Đang kiểm tra...' : 'Kiểm tra lại link công khai'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={activeShareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-h-[42px] px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 select-all focus:outline-none focus:ring-2 focus:ring-blue-600"
                aria-label="Đường dẫn tải ứng dụng"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`min-h-[42px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleNativeShare}
                className="flex-1 min-h-[40px] px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5 shrink-0" />
                <span>Gửi link qua Zalo / Messenger</span>
              </button>
              <a
                href={activeShareUrl || directOpenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-3 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Mở tab trình duyệt</span>
              </a>
            </div>

            {/* Crisp High-Contrast QR Code */}
            {qrDataUrl && (
              <div className="pt-3 border-t border-blue-200/70 flex flex-col sm:flex-row items-center gap-4">
                <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-xs shrink-0">
                  <img
                    src={qrDataUrl}
                    alt="Mã QR tải ứng dụng Công Nhật Pro"
                    className="w-48 h-48 sm:w-44 sm:h-44 block"
                  />
                </div>
                <div className="flex-1 w-full text-center sm:text-left space-y-2.5">
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-sm font-semibold text-slate-900">
                    <QrCode className="w-4 h-4 text-blue-600" />
                    <span>Quét mã QR bằng camera điện thoại</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {selectedLinkMode === 'current' && isDevStudioUrl
                      ? 'Dùng camera điện thoại (có đăng nhập Google của bạn) quét mã này để mở thẳng App. Nếu gửi cho người khác, hãy bật Share App trước rồi chọn "Link công khai".'
                      : 'Giơ camera điện thoại hoặc Zalo quét mã QR này để mở thẳng trang cài đặt App.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadQR}
                    className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 shadow-2xs"
                  >
                    <Download className="w-4 h-4 text-blue-600" />
                    <span>Lưu ảnh mã QR</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Install on this device */}
          {!isInstalled && (
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Cách cài thành App trên điện thoại của bạn
              </div>

              {isInstallable ? (
                <button
                  type="button"
                  onClick={onInstall}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Cài đặt App về máy ngay (1 chạm)</span>
                </button>
              ) : inIframe ? (
                <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  Bạn đang mở trong khung xem trước nên trình duyệt chưa hiện nút cài trực tiếp. Hãy bấm <strong>&ldquo;Mở tab trình duyệt&rdquo;</strong> ở trên (hoặc quét mã QR bằng điện thoại) để cài App.
                </div>
              ) : null}

              {(isIOS || !isAndroid) && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="text-xs font-bold text-slate-800">
                    iPhone / iPad (trình duyệt Safari)
                  </div>
                  <ol className="space-y-1.5 text-xs text-slate-700">
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <span>
                        Mở link bằng <strong>Safari</strong>, bấm nút{' '}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-900">
                          <Share className="w-3 h-3 text-blue-600" /> Chia sẻ
                        </span>{' '}
                        ở cạnh dưới màn hình.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <span>
                        Chọn{' '}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-900">
                          <PlusSquare className="w-3 h-3 text-blue-600" /> Thêm vào MH chính
                        </span>{' '}
                        → bấm <strong>Thêm</strong>.
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              {(!isIOS || isAndroid) && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="text-xs font-bold text-slate-800">
                    Điện thoại Android &amp; Máy tính (Google Chrome / Edge)
                  </div>
                  <ol className="space-y-1.5 text-xs text-slate-700">
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <span>
                        Mở link bằng <strong>Chrome</strong>, bấm nút{' '}
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-900">
                          <MoreVertical className="w-3 h-3 text-slate-700" /> Menu
                        </span>{' '}
                        ở góc trên bên phải (hoặc biểu tượng cài đặt trên thanh địa chỉ máy tính).
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <span>
                        Chọn <strong>&ldquo;Cài đặt ứng dụng&rdquo;</strong> hoặc{' '}
                        <strong>&ldquo;Thêm vào màn hình chính&rdquo;</strong> → bấm <strong>Cài đặt</strong>.
                      </span>
                    </li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky Always-Visible Mobile Action Footer */}
        <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2 pb-safe">
          {!isInstalled && isInstallable ? (
            <button
              type="button"
              onClick={onInstall}
              className="flex-1 min-h-[46px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Cài đặt App ngay</span>
            </button>
          ) : (
            <a
              href={activeShareUrl || directOpenUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-h-[46px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              <span>Mở tab để cài App</span>
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-sm font-semibold rounded-lg"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const AutoMobileInstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, isInAppBrowser, install } =
    usePWAInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('congnhat_install_banner_dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [copiedUrl, setCopiedUrl] = useState(false);

  const hasInstallParam = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('install') === '1';
  }, []);

  const inIframe = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('congnhat_install_banner_dismissed', '1');
      if (hasInstallParam) {
        const url = new URL(window.location.href);
        url.searchParams.delete('install');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    } catch {
      // Ignore storage errors
    }
  };

  const handleCopyCurrentUrl = async () => {
    const cleanUrl =
      typeof window !== 'undefined' ? `${window.location.origin}/?install=1` : '';
    if (!cleanUrl) return;
    try {
      await navigator.clipboard.writeText(cleanUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  if (isInstalled || dismissed || inIframe) {
    return null;
  }

  const shouldShow =
    isInstallable ||
    isInAppBrowser ||
    (hasInstallParam && (isIOS || isAndroid));

  if (!shouldShow) {
    return null;
  }

  return (
    <div
      className="fixed bottom-[74px] md:bottom-5 left-3 right-3 md:left-auto md:right-5 md:w-[360px] z-40 bg-white border border-blue-200 rounded-2xl shadow-xl p-4 space-y-3"
      role="region"
      aria-label="Cài đặt ứng dụng về điện thoại"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900">
              {isInAppBrowser
                ? 'Mở bằng Chrome / Safari để cài App'
                : 'Cài Công Nhật Pro về điện thoại'}
            </h4>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              {isInAppBrowser
                ? 'Zalo / Messenger / KakaoTalk đang chặn cài đặt App. Nhấn nút ⋮ ở góc phải → chọn "Mở bằng trình duyệt" (Chrome/Safari).'
                : isInstallable
                  ? 'Bấm nút bên dưới để cài biểu tượng App ra màn hình chính, dùng mượt cả khi mất mạng.'
                  : isIOS
                    ? 'Nhấn nút Chia sẻ (Share) ở thanh dưới Safari → chọn "Thêm vào MH chính" (Add to Home Screen).'
                    : 'Nhấn Menu ⋮ ở góc trên phải Chrome → chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính".'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
          aria-label="Ẩn thông báo cài đặt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {isInstallable ? (
        <button
          type="button"
          onClick={async () => {
            const ok = await install();
            if (ok) handleDismiss();
          }}
          className="w-full min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Cài đặt App ngay (1 chạm)</span>
        </button>
      ) : isInAppBrowser ? (
        <button
          type="button"
          onClick={handleCopyCurrentUrl}
          className="w-full min-h-[42px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          <span>{copiedUrl ? 'Đã sao chép link mở trên Chrome/Safari' : 'Sao chép link để mở bằng Chrome/Safari'}</span>
        </button>
      ) : null}
    </div>
  );
};
