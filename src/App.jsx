import React, { useEffect, useMemo, useRef, useState } from "react"; import { motion } from "framer-motion"; import { Button } from "@/components/ui/button"; import { Input } from "@/components/ui/input"; import { Textarea } from "@/components/ui/textarea"; import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; import { Switch } from "@/components/ui/switch"; import { Label } from "@/components/ui/label"; import { Badge } from "@/components/ui/badge"; import { Progress } from "@/components/ui/progress"; import { Separator } from "@/components/ui/separator"; import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; import { ToastAction } from "@/components/ui/toast"; import { useToast } from "@/components/ui/use-toast"; import { Download, Moon, Sun, Clock, Copy, Play, RefreshCw, Film, BarChart, HelpCircle, Instagram, Zap, Sparkles, Settings, KeyRound, Calendar, Trash2, UploadCloud } from "lucide-react"; import JSZip from "jszip";

/**

ReelGenie – “AI that creates, schedules & posts your Instagram Reels daily.”

Mobile‑first, lightweight, optimized for 2 GB RAM phones.

Single‑file demo app with front‑end logic, local persistence and API placeholders.

Notes

Video previews use a tiny placeholder MP4 blob to keep the bundle light.


FFmpeg/Remotion hooks are stubbed; connect your worker/back end when ready.


Scheduling, IG Graph API calls, analytics ingestion are mocked locally. */



// --------- Types --------- const VIDEO_TYPES = ["CTA", "Storytelling", "Educational", "Testimonial", "Authority"] as const; const LENGTHS = ["7s", "15s", "30s"] as const;

type VideoType = typeof VIDEO_TYPES[number]; type VideoLength = typeof LENGTHS[number];

type OverlayBlock = { t: number; // timestamp seconds kind: "text" | "infographic"; payload: any; // text content or infographic schema };

type OverlaySchema = { version: "1.0"; durationSec: number; blocks: OverlayBlock[]; };

type Reel = { id: string; createdAt: number; niche: string; product: string; videoType: VideoType; length: VideoLength; overlayStyle: "Text" | "Infographic"; caption: string; hashtags: string[]; overlay: OverlaySchema; previewUrl: string; // blob url status: "draft" | "queued" | "posted" | "archived"; scheduledAt?: number; // epoch ms postId?: string; // IG Graph media id };

type ScheduleItem = { reelId: string; time: number; attempts: number; maxRetries: number; };

// --------- Utilities --------- const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const clampHashtags = (tags: string[]) => { const n = Math.min(12, Math.max(5, tags.length)); return tags.slice(0, n); };

const sample = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

const creativeRotation: VideoType[] = [ "CTA", // Urgency flavor is embedded in copy "Educational", "Storytelling", "Testimonial", "Authority", ];

const nextRotationType = (index: number) => creativeRotation[index % creativeRotation.length];

// Tiny 1‑sec silent MP4 (black frame) – keeps preview ultra‑light // (Generated offline; base64 kept short. Reused per reel as Blob.) const tinyMp4Base64 = "AAAAHGZ0eXBpc29tAAAAAGlzb21pc28yYXZjMQAAAAhmcmVlAAAAIG1kYXQAAAAAAAACAAACAAABAAABAAAAAAAZAAA=";

function mp4BlobUrl(): string { const bstr = atob(tinyMp4Base64); const bytes = new Uint8Array(bstr.length); for (let i = 0; i < bstr.length; i++) bytes[i] = bstr.charCodeAt(i); const blob = new Blob([bytes], { type: "video/mp4" }); return URL.createObjectURL(blob); }

function genHashtags(niche: string, product: string, type: VideoType) { const base = [ #${niche.replace(/\s+/g, "")}, #${product.split(" ")[0].toLowerCase()}, "#reels", "#instagramreels", "#contentmarketing", "#viral", #${type.toLowerCase()}, "#ai", "#shortform", ]; // Add a couple more topical tags const extras = ["#howto", "#tips", "#trending", "#growth", "#storytime", "#review", "#learn"].sort( () => 0.5 - Math.random() ); return clampHashtags([...base, ...extras]); }

function genHook(type: VideoType, niche: string) { const hooks: Record<VideoType, string[]> = { CTA: [ Stop scrolling! ${niche} pros do THIS today…, You’re missing out if you don’t try this in ${niche}!, ], Educational: [ ${niche}: 3 quick tips in 15s, Beginners in ${niche} make this mistake…, ], Storytelling: [ I tried this ${niche} trick for 7 days…, A ${niche} story no one told you, ], Testimonial: [ Real results: how this changed my ${niche}, Before/After in ${niche}: 30 seconds, ], Authority: [ I’ve helped 100+ people with ${niche} — here’s the playbook, ${niche} in 30s: do this first, ], }; return sample(hooks[type]); }

function genCaption(hook: string, product: string, niche: string, type: VideoType) { const body = type === "CTA" ? Try ${product} today. Tap the link in bio to start. : type === "Educational" ? Quick breakdown to level up your ${niche}. Save for later! : type === "Storytelling" ? Here’s what I learned so you don’t have to. : type === "Testimonial" ? Real results from real use. Curious? : What actually works in ${niche} — distilled.; return ${hook}\n\n${body}; }

function genOverlay(length: VideoLength, style: "Text" | "Infographic"): OverlaySchema { const dur = length === "7s" ? 7 : length === "15s" ? 15 : 30; const blocks: OverlayBlock[] = []; const beats = style === "Text" ? [1, 3, 5, Math.max(6, dur - 2)] : [2, 6, Math.max(8, dur - 4)]; beats.forEach((t, i) => { blocks.push({ t, kind: style === "Text" ? "text" : "infographic", payload: style === "Text" ? { text: i === 0 ? "Hook" : i === beats.length - 1 ? "CTA" : Point ${i} } : { chart: i % 2 ? "bar" : "number", value: i * 25 + 25 }, }); }); return { version: "1.0", durationSec: dur, blocks }; }

// --------- Local persistence (very light) --------- const DB_KEYS = { user: "reelgenie:user", reels: "reelgenie:reels", schedule: "reelgenie:schedule", analytics: "reelgenie:analytics", };

const db = { get<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } }, set<T>(k: string, v: T) { localStorage.setItem(k, JSON.stringify(v)); }, };

// --------- Instagram API placeholders --------- async function ensureIGToken(): Promise<boolean> { // TODO: Swap with real OAuth/IG login const token = db.get(DB_KEYS.user, { igConnected: false, niche: "" } as any).igConnected; return !!token; }

async function igPublishReelMock(reel: Reel): Promise<{ success: true; id: string } | { success: false }> { // Replace with Instagram Graph API (media_type=REELS) publish flow await new Promise((r) => setTimeout(r, 600)); if (Math.random() < 0.85) return { success: true, id: IG_${uid()} }; return { success: false }; }

// --------- Core generation --------- function generateReelsBatch(params: { niche: string; product: string; startingIndex: number; // for rotation continuity length: VideoLength; overlayStyle: "Text" | "Infographic"; }): Reel[] { const list: Reel[] = []; for (let i = 0; i < 3; i++) { const type = nextRotationType(params.startingIndex + i); const hook = genHook(type, params.niche); const caption = genCaption(hook, params.product, params.niche, type); const hashtags = genHashtags(params.niche, params.product, type); const overlay = genOverlay(params.length, params.overlayStyle); list.push({ id: uid(), createdAt: Date.now(), niche: params.niche, product: params.product, videoType: type, length: params.length, overlayStyle: params.overlayStyle, caption, hashtags, overlay, previewUrl: mp4BlobUrl(), status: "draft", }); } return list; }

// --------- UI --------- function Header({ dark, setDark, goto }: { dark: boolean; setDark: (v: boolean) => void; goto: (p: string) => void }) { return ( <div className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-black/40 bg-white dark:bg-black border-b"> <div className="max-w-6xl mx-auto px-3 py-2 flex items-center justify-between gap-2"> <div className="flex items-center gap-2"> <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 grid place-items-center text-white"><Sparkles className="h-5 w-5"/></div> <div className="leading-tight"> <div className="font-semibold tracking-tight">ReelGenie</div> <div className="text-[10px] opacity-70">AI that creates, schedules & posts your Instagram Reels daily.</div> </div> </div> <div className="hidden sm:flex gap-1"> <Button variant="ghost" onClick={() => goto("home")}>Generator</Button> <Button variant="ghost" onClick={() => goto("dashboard")}>Dashboard</Button> <Button variant="ghost" onClick={() => goto("analytics")}>Analytics & Help</Button> </div> <div className="flex items-center gap-2"> <TooltipProvider><Tooltip><TooltipTrigger asChild> <Button variant="outline" size="icon" onClick={() => setDark(!dark)}> {dark ? <Sun className="h-4 w-4"/> : <Moon className="h-4 w-4"/>} </Button> </TooltipTrigger><TooltipContent>{dark ? "Light mode" : "Dark mode"}</TooltipContent></Tooltip></TooltipProvider> <Button onClick={() => goto("dashboard")} className="gap-2"><Instagram className="h-4 w-4"/> Connect IG</Button> </div> </div> </div> ); }

function Hero() { return ( <div className="text-center py-6 sm:py-10"> <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-2xl sm:text-4xl font-bold tracking-tight"> Create. Schedule. Post. <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-indigo-600">On autopilot.</span> </motion.h1> <p className="mt-2 text-sm sm:text-base opacity-80">Mobile‑first, ultra‑lightweight. Perfect for 2 GB RAM phones.</p> <div className="mt-3 flex items-center justify-center gap-2"> <Button className="gap-2"><Instagram className="h-4 w-4"/> Connect Instagram</Button> <Button variant="outline" className="gap-2"><KeyRound className="h-4 w-4"/> Use API Token</Button> </div> </div> ); }

function Generator({ onGenerate, onScheduleAll, onDownloadAll, reels, setReels, }: { onGenerate: (params: { niche: string; product: string; type: VideoType; length: VideoLength; times: "auto" | "manual"; overlayStyle: "Text" | "Infographic" }) => void; onScheduleAll: () => void; onDownloadAll: () => void; reels: Reel[]; setReels: (v: Reel[]) => void; }) { const [niche, setNiche] = useState(""); const [product, setProduct] = useState(""); const [type, setType] = useState<VideoType>("CTA"); const [length, setLength] = useState<VideoLength>("15s"); const [times, setTimes] = useState<"auto" | "manual">("auto"); const [overlayStyle, setOverlayStyle] = useState<"Text" | "Infographic">("Text");

const { toast } = useToast();

useEffect(() => { const u = db.get(DB_KEYS.user, { igConnected: false, niche: "", product: "" }); if (u.niche) setNiche(u.niche); if (u.product) setProduct(u.product); }, []);

function savePrefs() { const u = db.get(DB_KEYS.user, { igConnected: false }); db.set(DB_KEYS.user, { ...u, niche, product }); }

return ( <Card className="shadow-sm"> <CardHeader> <CardTitle className="flex items-center gap-2"><Film className="h-5 w-5"/> Reel Generator</CardTitle> </CardHeader> <CardContent className="grid gap-3"> <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"> <div className="grid gap-2"> <Label>Niche</Label> <Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g., fitness, skincare, crypto"/> </div> <div className="grid gap-2"> <Label>Product Description</Label> <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="What are you promoting?"/> </div> <div className="grid gap-2"> <Label>Video Type</Label> <Select value={type} onValueChange={(v) => setType(v as VideoType)}> <SelectTrigger><SelectValue/></SelectTrigger> <SelectContent>{VIDEO_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent> </Select> </div> <div className="grid gap-2"> <Label>Video Length</Label> <Select value={length} onValueChange={(v) => setLength(v as VideoLength)}> <SelectTrigger><SelectValue/></SelectTrigger> <SelectContent>{LENGTHS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent> </Select> </div> <div className="grid gap-2"> <Label>Posting Times</Label> <Tabs value={times} onValueChange={(v) => setTimes(v as any)} className="w-full"> <TabsList className="grid grid-cols-2"> <TabsTrigger value="auto" className="gap-1"><Zap className="h-3 w-3"/> Auto</TabsTrigger> <TabsTrigger value="manual" className="gap-1"><Clock className="h-3 w-3"/> Manual</TabsTrigger> </TabsList> <TabsContent value="manual" className="text-xs opacity-70">You’ll pick times in Dashboard → Schedule.</TabsContent> <TabsContent value="auto" className="text-xs opacity-70">We’ll pick best times based on your past engagement.</TabsContent> </Tabs> </div> <div className="grid grid-cols-[auto,1fr] items-center gap-3"> <Switch checked={overlayStyle === "Infographic"} onCheckedChange={(v) => setOverlayStyle(v ? "Infographic" : "Text")}/> <div> <div className="font-medium">Overlay Style</div> <div className="text-xs opacity-70">{overlayStyle} overlays</div> </div> </div> </div>

<div className="flex flex-wrap gap-2 pt-1">
      <Button className="gap-2" onClick={() => { savePrefs(); onGenerate({ niche, product, type, length, times, overlayStyle }); }}>
        <Sparkles className="h-4 w-4"/> Generate Reels
      </Button>
      <Button variant="secondary" className="gap-2" onClick={onScheduleAll}>
        <Calendar className="h-4 w-4"/> Schedule All
      </Button>
      <Button variant="outline" className="gap-2" onClick={onDownloadAll}>
        <Download className="h-4 w-4"/> Download All
      </Button>
    </div>

    <Separator/>

    {reels.length === 0 ? (
      <div className="text-sm opacity-70">No reels yet. Generate to see previews here.</div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {reels.slice(0, 3).map((r) => (
          <ReelCard key={r.id} reel={r} onUpdate={(nr) => setReels(reels.map(x => x.id===nr.id?nr:x))}/>
        ))}
      </div>
    )}
  </CardContent>
</Card>

); }

function ReelCard({ reel, onUpdate }: { reel: Reel; onUpdate: (r: Reel) => void }) { const { toast } = useToast(); function copyCaption() { navigator.clipboard.writeText(${reel.caption}\n\n${reel.hashtags.join(" ")}); toast({ title: "Caption copied" }); } async function downloadZip() { const zip = new JSZip(); // Placeholder video (tiny) const res = await fetch(reel.previewUrl); const blob = await res.blob(); zip.file(reel-${reel.id}.mp4, blob); zip.file(caption-${reel.id}.txt, ${reel.caption}\n\n${reel.hashtags.join(" ")}); zip.file(overlay-${reel.id}.json, JSON.stringify(reel.overlay, null, 2)); const content = await zip.generateAsync({ type: "blob" }); const url = URL.createObjectURL(content); const a = document.createElement("a"); a.href = url; a.download = ReelGenie-${reel.id}.zip; a.click(); URL.revokeObjectURL(url); } return ( <Card className="overflow-hidden"> <CardHeader className="pb-2"> <CardTitle className="text-base flex items-center justify-between"> <span className="truncate">{reel.videoType} • {reel.length}</span> <Badge variant={reel.status === "posted" ? "default" : reel.status === "queued" ? "secondary" : "outline"}>{reel.status}</Badge> </CardTitle> </CardHeader> <CardContent className="grid gap-2"> <div className="aspect-[9/16] rounded-xl bg-black/5 dark:bg-white/5 grid place-items-center overflow-hidden"> <video src={reel.previewUrl} className="h-full" muted playsInline controls poster=""/> </div> <div className="text-xs line-clamp-3 opacity-80">{reel.caption}</div> <div className="flex flex-wrap gap-2 pt-1"> <Button size="sm" className="gap-2" onClick={downloadZip}><Download className="h-3 w-3"/> Download</Button> <Button size="sm" variant="secondary" className="gap-2" onClick={copyCaption}><Copy className="h-3 w-3"/> Copy Caption</Button> <Button size="sm" variant="outline" className="gap-2" onClick={() => onUpdate({ ...reel, status: "queued", scheduledAt: Date.now() + 10 * 60 * 1000 })}><Calendar className="h-3 w-3"/> Schedule</Button> </div> </CardContent> </Card> ); }

function Dashboard({ reels, setReels, schedule, setSchedule }: { reels: Reel[]; setReels: (v: Reel[]) => void; schedule: ScheduleItem[]; setSchedule: (v: ScheduleItem[]) => void; }) { const queued = reels.filter(r => r.status === "queued"); const posted = reels.filter(r => r.status === "posted"); const archived = reels.filter(r => r.status === "archived");

function archive(id: string) { setReels(reels.map(r => r.id === id ? { ...r, status: "archived" } : r)); } function regenerate(id: string) { setReels(reels.map(r => r.id === id ? { ...r, caption: r.caption + "\n(Refreshed)", previewUrl: mp4BlobUrl(), createdAt: Date.now() } : r)); }

return ( <div className="grid gap-4"> <Card> <CardHeader> <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5"/> Scheduled Posts</CardTitle> </CardHeader> <CardContent className="grid gap-2 text-sm"> {queued.length === 0 ? <div className="opacity-70">No queued posts.</div> : ( <div className="grid gap-2"> {queued.map(r => ( <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-xl border"> <div className="flex items-center gap-2"> <Badge>{r.videoType}</Badge> <div className="truncate max-w-[180px] sm:max-w-[360px]">{r.caption}</div> </div> <div className="flex items-center gap-2"> <div className="text-xs opacity-70"><Clock className="inline h-3 w-3 mr-1"/>{r.scheduledAt ? new Date(r.scheduledAt).toLocaleString() : "—"}</div> <Button size="sm" variant="secondary" onClick={() => regenerate(r.id)}><RefreshCw className="h-3 w-3 mr-1"/> Regenerate</Button> <Button size="sm" variant="outline" onClick={() => archive(r.id)}><Trash2 className="h-3 w-3 mr-1"/> Archive</Button> </div> </div> ))} </div> )} </CardContent> </Card>

<Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5"/> Posted</CardTitle>
    </CardHeader>
    <CardContent className="grid gap-2 text-sm">
      {posted.length === 0 ? <div className="opacity-70">Nothing posted yet.</div> : posted.map(r => (
        <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-xl border">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{r.videoType}</Badge>
            <div className="truncate max-w-[220px] sm:max-w-[520px]">{r.caption}</div>
          </div>
          <div className="text-xs opacity-70">{r.postId}</div>
        </div>
      ))}
    </CardContent>
  </Card>

  {archived.length > 0 && (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5"/> Archived Reels</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {archived.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-xl border">
            <div className="truncate">{r.caption}</div>
            <Button size="sm" onClick={() => regenerate(r.id)}><RefreshCw className="h-3 w-3 mr-1"/> Regenerate</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )}
</div>

); }

function AnalyticsHelp({ reels }: { reels: Reel[] }) { const posted = reels.filter(r => r.status === "posted"); const total = posted.length; const totalEngagement = Math.round(total * 137 + (reels.length % 91)); // mocked metric const bestTimes = ["09:00", "13:00", "19:30"]; // would be computed from IG API

return ( <div className="grid gap-4"> <Card> <CardHeader> <CardTitle className="flex items-center gap-2"><BarChart className="h-5 w-5"/> Analytics</CardTitle> </CardHeader> <CardContent className="grid grid-cols-3 gap-3 text-center"> <Stat label="# Reels Posted" value={total}/> <Stat label="Engagement" value={totalEngagement}/> <Stat label="Best Times" value={bestTimes.join(" • ")}/> </CardContent> </Card>

<Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5"/> FAQ</CardTitle>
    </CardHeader>
    <CardContent className="text-sm grid gap-3">
      <div>
        <div className="font-medium">How are reels generated?</div>
        <div className="opacity-80">We rotate creative styles (Urgency/CTA, Education, Storytelling, Testimonial, Authority) and auto‑build overlays with timestamps. FFmpeg/Remotion renderers stitch visuals + audio server‑side.</div>
      </div>
      <div>
        <div className="font-medium">Can I edit captions and overlays?</div>
        <div className="opacity-80">Yes. Export the overlay JSON, tweak blocks, and re‑upload to your renderer, or regenerate in Dashboard.</div>
      </div>
      <div>
        <div className="font-medium">How does scheduling work?</div>
        <div className="opacity-80">We queue posts and publish via Instagram Graph API (media_type=REELS). Retries handle transient failures.</div>
      </div>
      <Separator/>
      <div className="grid gap-2">
        <div className="font-medium">Contact</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input placeholder="Your email"/>
          <Input placeholder="Subject"/>
          <Button>Send</Button>
        </div>
      </div>
    </CardContent>
  </Card>
</div>

); }

function Stat({ label, value }: { label: string; value: React.ReactNode }) { return ( <div className="p-3 rounded-2xl border"> <div className="text-xs opacity-70">{label}</div> <div className="text-xl font-semibold">{value}</div> </div> ); }

export default function App() { const [page, setPage] = useState<"home" | "dashboard" | "analytics">("home"); const [dark, setDark] = useState(false); const [reels, setReels] = useState<Reel[]>(() => db.get(DB_KEYS.reels, [] as Reel[])); const [schedule, setSchedule] = useState<ScheduleItem[]>(() => db.get(DB_KEYS.schedule, [] as ScheduleItem[])); const rotationRef = useRef(0); const { toast } = useToast();

useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]); useEffect(() => { db.set(DB_KEYS.reels, reels); }, [reels]); useEffect(() => { db.set(DB_KEYS.schedule, schedule); }, [schedule]);

// Auto‑generate daily if no new input (uses saved niche) useEffect(() => { const u = db.get(DB_KEYS.user, { niche: "" }); const lastGen = db.get("reelgenie:lastGen", 0 as number); const now = Date.now(); const day = 24 * 60 * 60 * 1000; if (u.niche && now - lastGen > day) { const fresh = generateReelsBatch({ niche: u.niche, product: u.product || "", startingIndex: rotationRef.current, length: "15s", overlayStyle: "Text" }); rotationRef.current += 3; setReels((prev) => [...fresh, ...prev]); db.set("reelgenie:lastGen", now); toast({ title: "Auto‑generated 3 new reels" }); } }, []);

// Mock scheduler loop (posts queued items) useEffect(() => { const iv = setInterval(async () => { const now = Date.now(); let updated = false; const newReels = reels.map((r) => { if (r.status === "queued" && r.scheduledAt && r.scheduledAt <= now) { updated = true; return { ...r, status: "posted", postId: IG_${uid()} }; } return r; }); if (updated) setReels(newReels); }, 5000); return () => clearInterval(iv); }, [reels]);

function handleGenerate(params: { niche: string; product: string; type: VideoType; length: VideoLength; times: "auto" | "manual"; overlayStyle: "Text" | "Infographic" }) { if (!params.niche || !params.product) { toast({ title: "Please fill niche & product", variant: "destructive" }); return; } const batch = generateReelsBatch({ niche: params.niche, product: params.product, startingIndex: rotationRef.current, length: params.length, overlayStyle: params.overlayStyle }); rotationRef.current += 3; setReels(batch); if (params.times === "auto") { // Auto schedule at +1h, +5h, +9h const now = Date.now(); setReels((prev) => prev.map((r, i) => ({ ...r, status: "queued", scheduledAt: now + (i * 4 + 1) * 60 * 60 * 1000 }))); toast({ title: "Scheduled 3 reels automatically" }); } }

async function scheduleAll() { const now = Date.now(); setReels(reels.map((r, i) => ({ ...r, status: "queued", scheduledAt: r.scheduledAt || now + (i + 1) * 60 * 60 * 1000 }))); toast({ title: "All reels queued" }); }

async function downloadAll() { if (reels.length === 0) return; const zip = new JSZip(); for (const r of reels.slice(0, 3)) { const res = await fetch(r.previewUrl); const blob = await res.blob(); const folder = zip.folder(r.id)!; folder.file(video.mp4, blob); folder.file(caption.txt, ${r.caption}\n\n${r.hashtags.join(" ")}); folder.file(overlay.json, JSON.stringify(r.overlay, null, 2)); } const content = await zip.generateAsync({ type: "blob" }); const url = URL.createObjectURL(content); const a = document.createElement("a"); a.href = url; a.download = ReelGenie-batch.zip; a.click(); URL.revokeObjectURL(url); }

return ( <div className="min-h-[100dvh] bg-white dark:bg-black text-black dark:text-white"> <Header dark={dark} setDark={setDark} goto={(p) => setPage(p as any)} /> <main className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-6 grid gap-4"> {page === "home" && ( <> <Hero /> <Generator onGenerate={handleGenerate} onScheduleAll={scheduleAll} onDownloadAll={downloadAll} reels={reels} setReels={setReels} /> </> )} {page === "dashboard" && <Dashboard reels={reels} setReels={setReels} schedule={schedule} setSchedule={setSchedule} />} {page === "analytics" && <AnalyticsHelp reels={reels} />} <Card> <CardContent className="py-3 text-[11px] sm:text-xs opacity-70"> Optional watermark: <Badge variant="outline">Generated by ReelGenie</Badge> • Rendering: FFmpeg/Remotion (server/worker) • Direct MP4 download supported • Light/Dark mode </CardContent> </Card> </main> </div> ); }

// ---------------- Integration Notes ---------------- /**

Backend sketch (connect your server):

POST /api/generate

body: { niche, productDescription, videoType, lengthSec, overlayStyle }


returns: { id, overlaySchema, caption, hashtags[], s3PreviewUrl, s3FinalUrl? }


implementation: LLM prompt → JSON overlay schema → Remotion/FFmpeg render → store to S3 → return URLs


POST /api/schedule

body: { reelId, when }


queue worker posts via Instagram Graph API: POST /{ig_user_id}/media (media_type=REELS),


then /{ig_user_id}/media_publish

retry w/ exponential backoff, persist postId


GET /api/analytics

pull insights: impressions, comments, likes, reach; compute best posting times


Data Model:

Users(id, ig_access_token, niche, settings)

Reels(id, user_id, type, length, overlay_json, caption, hashtags, preview_url, final_url, status, scheduled_at, post_id)

Schedule(id, reel_id, when, attempts, max_retries)

Analytics(user_id, counters, last_sync) */


