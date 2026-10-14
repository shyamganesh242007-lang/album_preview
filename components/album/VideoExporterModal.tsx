'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Album } from '@/types/album';
import {
  VideoFormat,
  ExportScope,
  TransitionStyle,
  renderAlbumVideo,
  VideoExportResult,
} from '@/utils/videoRenderer';
import {
  renderContinuousPageCurl2D,
  getTransitionProfile,
} from '@/utils/pageCurlEngine';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  Video,
  Monitor,
  Smartphone,
  Layers,
  Sparkles,
  Clock,
  ShieldCheck,
  Download,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Film,
  Eye,
} from 'lucide-react';

interface VideoExporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  album: Album;
}

/**
 * Live Interactive Transition Preview Component
 * Provides immediate visual feedback for the selected transition preset
 */
const TransitionPreviewBox: React.FC<{
  transitionStyle: TransitionStyle;
  album: Album;
}> = ({ transitionStyle, album }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);

  const profile = getTransitionProfile(transitionStyle);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let startTime = performance.now();
    const cycleHoldSec = 0.8;
    const cycleTurnSec =
      profile.name === 'cinematic-turn'
        ? 2.0
        : profile.name === 'soft-turn'
        ? 1.8
        : profile.name === 'soft-fade'
        ? 1.2
        : 1.5;
    const cycleTotalSec = cycleHoldSec + cycleTurnSec + 0.6;

    // Create 2 styled demo page textures
    const pw = 160;
    const ph = 110;
    const pageA = document.createElement('canvas');
    pageA.width = pw;
    pageA.height = ph;
    const ctxA = pageA.getContext('2d')!;
    const gradA = ctxA.createLinearGradient(0, 0, pw, ph);
    gradA.addColorStop(0, '#1e1b4b');
    gradA.addColorStop(1, '#0f172a');
    ctxA.fillStyle = gradA;
    ctxA.fillRect(0, 0, pw, ph);
    ctxA.fillStyle = '#c4b5fd';
    ctxA.font = 'bold 11px system-ui';
    ctxA.textAlign = 'center';
    ctxA.fillText('Page 1', pw / 2, ph / 2);

    const pageB = document.createElement('canvas');
    pageB.width = pw;
    pageB.height = ph;
    const ctxB = pageB.getContext('2d')!;
    const gradB = ctxB.createLinearGradient(0, 0, pw, ph);
    gradB.addColorStop(0, '#2e1065');
    gradB.addColorStop(1, '#1e1b4b');
    ctxB.fillStyle = gradB;
    ctxB.fillRect(0, 0, pw, ph);
    ctxB.fillStyle = '#e9d5ff';
    ctxB.font = 'bold 11px system-ui';
    ctxB.textAlign = 'center';
    ctxB.fillText('Page 2', pw / 2, ph / 2);

    // If album has real preview URLs, load them async
    const imgA = new Image();
    imgA.crossOrigin = 'anonymous';
    if (album.pages[0]?.previewUrl) imgA.src = album.pages[0].previewUrl;

    const imgB = new Image();
    imgB.crossOrigin = 'anonymous';
    if (album.pages[1]?.previewUrl) imgB.src = album.pages[1].previewUrl;

    const renderFrame = (now: number) => {
      const elapsed = ((now - startTime) / 1000) % cycleTotalSec;
      let rawP = 0;
      if (elapsed > cycleHoldSec && elapsed < cycleHoldSec + cycleTurnSec) {
        rawP = (elapsed - cycleHoldSec) / cycleTurnSec;
      } else if (elapsed >= cycleHoldSec + cycleTurnSec) {
        rawP = 1;
      }

      const cw = canvas.width;
      const ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);

      // Studio background
      const bg = ctx.createRadialGradient(cw / 2, ch / 2, 20, cw / 2, ch / 2, cw * 0.7);
      bg.addColorStop(0, '#f8fafc');
      bg.addColorStop(1, '#e2e8f0');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);

      const singleW = 120;
      const singleH = 80;
      const spreadW = singleW * 2;
      const sx = Math.round((cw - spreadW) / 2);
      const sy = Math.round((ch - singleH) / 2);
      const spineX = sx + singleW;

      // Base album shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx, sy, spreadW, singleH);
      ctx.restore();

      const activeImgA = imgA.complete && imgA.naturalWidth > 0 ? imgA : pageA;
      const activeImgB = imgB.complete && imgB.naturalWidth > 0 ? imgB : pageB;

      if (transitionStyle === 'soft-fade') {
        // Soft Fade Cross Dissolve
        const cx = cw / 2;
        const cy = ch / 2;

        // Spread A dissolves out with subtle scale drift
        ctx.save();
        ctx.globalAlpha = 1 - rawP;
        const scA = 1.0 + 0.018 * rawP;
        ctx.translate(cx, cy);
        ctx.scale(scA, scA);
        ctx.translate(-cx, -cy);
        ctx.drawImage(activeImgA, sx, sy, singleW, singleH);
        ctx.drawImage(activeImgA, sx + singleW, sy, singleW, singleH);
        ctx.restore();

        // Spread B dissolves in
        ctx.save();
        ctx.globalAlpha = rawP;
        const scB = 0.982 + 0.018 * rawP;
        ctx.translate(cx, cy);
        ctx.scale(scB, scB);
        ctx.translate(-cx, -cy);
        ctx.drawImage(activeImgB, sx, sy, singleW, singleH);
        ctx.drawImage(activeImgB, sx + singleW, sy, singleW, singleH);
        ctx.restore();
      } else {
        // Physical page turns
        const easeP = profile.easeProgress(rawP);

        // Draw left base page (page A)
        ctx.drawImage(activeImgA, sx, sy, singleW, singleH);
        // Draw right base page (page B underneath)
        ctx.drawImage(activeImgB, spineX, sy, singleW, singleH);

        // Spine gutter shadow
        const gutter = ctx.createLinearGradient(spineX - 12, 0, spineX + 12, 0);
        gutter.addColorStop(0, 'rgba(0,0,0,0)');
        gutter.addColorStop(0.5, 'rgba(0,0,0,0.22)');
        gutter.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gutter;
        ctx.fillRect(spineX - 12, sy, 24, singleH);

        if (rawP > 0.001 && rawP < 0.999) {
          renderContinuousPageCurl2D(ctx, {
            frontImg: activeImgA,
            backImg: activeImgB,
            pageWidth: singleW,
            pageHeight: singleH,
            spineX,
            spineY: sy,
            progress: easeP,
            direction: 'next',
            grabRegion: 'edge',
            stylePreset: transitionStyle,
          });
        }
      }

      // Thin border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy, spreadW, singleH);

      animRef.current = requestAnimationFrame(renderFrame);
    };

    animRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [transitionStyle, album]);

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d101a]/70 p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs font-semibold text-slate-200">
            Live Preview:{' '}
            <span className="text-purple-400 font-bold">{profile.label}</span>
          </span>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#141826] border border-slate-800 text-slate-300 shadow-2xs">
          {profile.name === 'real-3d-curl' && '⭐ Authentic Paper Cylinder Curvature'}
          {profile.name === 'soft-turn' && '🍃 Shallow 28px Arc · Flatter Depth'}
          {profile.name === 'cinematic-turn' && '🎬 Dramatic 108px Arch · Camera Push-in'}
          {profile.name === 'soft-fade' && '✨ Photographic Cross Dissolve'}
        </span>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-[#0d101a] flex items-center justify-center h-[120px]">
        <canvas
          ref={canvasRef}
          width={360}
          height={120}
          className="w-full h-full object-contain"
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-0.5">
        <span>{profile.tagline}</span>
        <span className="text-slate-500 font-mono text-[10px]">
          {profile.name === 'real-3d-curl' && 'Lift: 64px | Cam: 1400 | Ease: Smoothstep'}
          {profile.name === 'soft-turn' && 'Lift: 28px | Cam: 2600 | Ease: Quintic'}
          {profile.name === 'cinematic-turn' && 'Lift: 108px | Cam: 920 | Zoom: +5.5%'}
          {profile.name === 'soft-fade' && 'Lift: 0px | Scale Drift: 1.8%'}
        </span>
      </div>
    </div>
  );
};

export const VideoExporterModal: React.FC<VideoExporterModalProps> = ({
  isOpen,
  onClose,
  album,
}) => {
  // Configuration options state
  const [format, setFormat] = useState<VideoFormat>('youtube-16-9');
  const [scope, setScope] = useState<ExportScope>('complete');
  const [transitionStyle, setTransitionStyle] = useState<TransitionStyle>('real-3d-curl');
  const [duration, setDuration] = useState<number>(1.5);
  const [watermark, setWatermark] = useState<boolean>(true);

  // Export engine state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [currentSpread, setCurrentSpread] = useState<number>(0);
  const [totalSpreads, setTotalSpreads] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [exportResult, setExportResult] = useState<VideoExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Clean up object URLs when closing or unmounting
  useEffect(() => {
    return () => {
      if (exportResult?.url) {
        URL.revokeObjectURL(exportResult.url);
      }
    };
  }, [exportResult]);

  // Handle modal close
  const handleModalClose = () => {
    if (isExporting) {
      if (confirm('A video export is in progress. Are you sure you want to cancel?')) {
        abortControllerRef.current?.abort();
        setIsExporting(false);
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Start Export Process
  const handleStartExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportResult(null);
    setProgressPercent(0);
    setStatusMessage('Initializing 3D renderer...');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await renderAlbumVideo(album, {
        format,
        scope,
        transitionStyle,
        spreadDurationSec: duration,
        includeWatermark: watermark,
        signal: abortController.signal,
        onProgress: (p) => {
          setProgressPercent(p.percent);
          setCurrentSpread(p.currentSpread);
          setTotalSpreads(p.totalSpreads);
          setStatusMessage(p.statusText);
        },
      });

      setExportResult(result);
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        setStatusMessage('Export cancelled');
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Video export failed';
        console.error('Video export error:', err);
        setExportError(errorMsg);
      }
    } finally {
      setIsExporting(false);
      abortControllerRef.current = null;
    }
  };

  // Cancel running export
  const handleCancelExport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsExporting(false);
    setStatusMessage('Export cancelled.');
  };

  // Download Generated Video
  const handleDownloadVideo = () => {
    if (!exportResult) return;
    const a = document.createElement('a');
    a.href = exportResult.url;
    a.download = exportResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      title="3D Flipbook Video Exporter"
      description="High-Definition Media Renderer"
      maxWidth="2xl"
    >
      <div className="space-y-6 pt-1 text-slate-200">
        {/* COMPLETED SUCCESS STATE */}
        {exportResult ? (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/30 p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-emerald-200">Video ready for download</h4>
                <p className="text-xs text-emerald-400 mt-0.5">
                  High-definition wedding album presentation rendered at 30 FPS.
                  {` (${Math.round(exportResult.durationSec)}s, ${(exportResult.blob.size / (1024 * 1024)).toFixed(1)} MB)`}
                </p>
              </div>
            </div>

            {/* Video Preview */}
            <div className="rounded-xl overflow-hidden border border-slate-800 bg-black shadow-inner max-h-[340px] flex items-center justify-center">
              <video
                src={exportResult.url}
                controls
                autoPlay
                loop
                className="max-h-[340px] w-auto max-w-full"
              />
            </div>

            {/* Actions for finished video */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setExportResult(null);
                  setProgressPercent(0);
                }}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Change Settings
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Done
                </Button>
                <Button variant="primary" size="md" onClick={handleDownloadVideo}>
                  <Download className="w-4 h-4 mr-1.5" />
                  Download Video
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* CONFIGURATION & RENDERING STATE */
          <>
            {/* 1. FORMAT & ASPECT RATIO */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Format & Aspect Ratio
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* YouTube 16:9 */}
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setFormat('youtube-16-9')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    format === 'youtube-16-9'
                      ? 'border-purple-500 bg-purple-950/25 ring-2 ring-purple-500/30 shadow-sm'
                      : 'border-slate-800/90 hover:border-slate-700 bg-[#0d101a] hover:bg-[#131826]'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      format === 'youtube-16-9' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-100 flex items-center gap-1.5">
                      YouTube 16:9
                      <span className="text-[11px] font-normal px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        1080p
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Landscape presentation for TV, monitor & portfolio
                    </p>
                  </div>
                </button>

                {/* Instagram Reels 9:16 */}
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setFormat('reels-9-16')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    format === 'reels-9-16'
                      ? 'border-purple-500 bg-purple-950/25 ring-2 ring-purple-500/30 shadow-sm'
                      : 'border-slate-800/90 hover:border-slate-700 bg-[#0d101a] hover:bg-[#131826]'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      format === 'reels-9-16' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-100 flex items-center gap-1.5">
                      Instagram Reels
                      <span className="text-[11px] font-normal px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        9:16
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Vertical format optimized for Reels, TikTok & Stories
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* 2. EXPORT SCOPE */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Export Scope
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Complete Album (Default) */}
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setScope('complete')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    scope === 'complete'
                      ? 'border-purple-500 bg-purple-950/25 ring-2 ring-purple-500/30'
                      : 'border-slate-800/90 hover:border-slate-700 bg-[#0d101a] hover:bg-[#131826]'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      scope === 'complete' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-100">Complete Album</div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      All spreads from Front Cover to Back Cover
                    </p>
                  </div>
                </button>

                {/* Quick Highlights */}
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setScope('highlights')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    scope === 'highlights'
                      ? 'border-purple-500 bg-purple-950/25 ring-2 ring-purple-500/30'
                      : 'border-slate-800/90 hover:border-slate-700 bg-[#0d101a] hover:bg-[#131826]'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      scope === 'highlights' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Film className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-100">Quick Highlights</div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      First 10 spreads (or full album if under 10)
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* 3. PAGE TURN / TRANSITION STYLE */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Page Turn / Transition Style
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Real 3D Page Curl (⭐ DEFAULT) */}
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setTransitionStyle('real-3d-curl')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    transitionStyle === 'real-3d-curl'
                      ? 'border-purple-500 bg-purple-950/25 ring-2 ring-purple-500/30'
                      : 'border-slate-800/90 hover:border-slate-700 bg-[#0d101a] hover:bg-[#131826]'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      transitionStyle === 'real-3d-curl'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-100 flex items-center gap-1.5">
                      Real 3D Page Curl
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-950/40 text-amber-300 border border-amber-800/40">
                        ⭐ DEFAULT
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Physical curved paper, perspective, backside & moving shadows
                    </p>
                  </div>
                </button>

                {/* 2. Soft Page Turn */}
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setTransitionStyle('soft-turn')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    transitionStyle === 'soft-turn'
                      ? 'border-purple-500 bg-purple-950/25 ring-2 ring-purple-500/30'
                      : 'border-slate-800/90 hover:border-slate-700 bg-[#0d101a] hover:bg-[#131826]'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      transitionStyle === 'soft-turn'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-100">Soft Page Turn</div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Gentle physical page-turn with slower, smoother motion
                    </p>
                  </div>
                </button>

                {/* 3. Cinematic Page Turn */}
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setTransitionStyle('cinematic-turn')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    transitionStyle === 'cinematic-turn'
                      ? 'border-purple-500 bg-purple-950/25 ring-2 ring-purple-500/30'
                      : 'border-slate-800/90 hover:border-slate-700 bg-[#0d101a] hover:bg-[#131826]'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      transitionStyle === 'cinematic-turn'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Film className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-100">Cinematic Page Turn</div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Dramatic 3D depth, richer shadows & slow elegant pacing
                    </p>
                  </div>
                </button>

                {/* 4. Soft Fade */}
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setTransitionStyle('soft-fade')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    transitionStyle === 'soft-fade'
                      ? 'border-purple-500 bg-purple-950/25 ring-2 ring-purple-500/30'
                      : 'border-slate-800/90 hover:border-slate-700 bg-[#0d101a] hover:bg-[#131826]'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      transitionStyle === 'soft-fade'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Video className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-100">Soft Fade</div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Clean cross-dissolve transition between spreads
                    </p>
                  </div>
                </button>
              </div>

              {/* LIVE TRANSITION PREVIEW */}
              <TransitionPreviewBox transitionStyle={transitionStyle} album={album} />
            </div>

            {/* 4. DURATION PER SPREAD */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  Duration per Spread
                </label>
                <span className="text-sm font-semibold text-purple-300 bg-purple-950/50 px-2 py-0.5 rounded-md border border-purple-800/40">
                  {duration.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min="0.8"
                max="3.0"
                step="0.1"
                disabled={isExporting}
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value))}
                className="w-full accent-purple-600 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
              <div className="flex justify-between text-[11px] text-slate-500 font-medium px-1 mt-1">
                <span>Fast (0.8s)</span>
                <span>Standard (1.5s)</span>
                <span>Cinematic (3.0s)</span>
              </div>
            </div>

            {/* 5. WATERMARK */}
            <div className="pt-1">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  disabled={isExporting}
                  checked={watermark}
                  onChange={(e) => setWatermark(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <div>
                  <div className="text-sm font-medium text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-slate-400" />
                    Include luxury Studio Hallmark Watermark
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Overlays elegant studio signature watermark on output video
                  </p>
                </div>
              </label>
            </div>

            {/* ERROR DISPLAY */}
            {exportError && (
              <div className="rounded-xl border border-red-800/40 bg-red-950/40 p-3.5 flex items-start gap-3 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-red-200">Export failed</p>
                  <p className="mt-0.5">{exportError}</p>
                </div>
              </div>
            )}

            {/* PROGRESS BAR (DURING EXPORT) */}
            {isExporting && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    Rendering Album Video...
                  </span>
                  <span className="font-bold text-purple-400">{progressPercent}%</span>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700/50">
                  <div
                    className="bg-purple-600 h-2.5 rounded-full transition-all duration-150 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{statusMessage}</span>
                  {totalSpreads > 0 && (
                    <span>
                      Spread {currentSpread} of {totalSpreads}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* MODAL ACTIONS */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <Button
                variant="outline"
                size="md"
                disabled={isExporting}
                onClick={handleModalClose}
              >
                Cancel
              </Button>

              {isExporting ? (
                <Button
                  variant="danger"
                  size="md"
                  onClick={handleCancelExport}
                >
                  Cancel Export
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleStartExport}
                  disabled={album.pages.length === 0}
                >
                  <Video className="w-4 h-4 mr-1.5" />
                  Export Video
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
