import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useAuth } from './lib/AuthContext';
import { generateVideo, generateImage, getVideosOperation } from './lib/gemini';
import { 
  deductCredit, 
  saveVideo, 
  updateVideoStatus, 
  subscribeToVideos, 
  testConnection,
  saveImage,
  subscribeToImages,
  createPayment,
  subscribeToUserPayments,
  subscribeToAllPayments,
  confirmPayment
} from './lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { 
  Video as VideoIcon, 
  Sparkles, 
  History, 
  CreditCard, 
  LogOut, 
  Play, 
  Loader2, 
  AlertCircle,
  Download,
  CheckCircle2,
  Coins,
  Image as ImageIcon,
  Upload,
  X,
  Lock,
  DollarSign,
  ShieldCheck,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './lib/AuthContext';

function MainApp() {
  const { user, dbUser, login, logout, loading: authLoading } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [videos, setVideos] = useState<any[]>([]);
  const [images, setImages] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('create');
  const [genType, setGenType] = useState<'video' | 'image'>('video');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [pendingPaymentInfo, setPendingPaymentInfo] = useState<{ amount: number, type: 'credits' | 'single_video', videoId?: string } | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const isAdmin = user?.email === "yirsawbiniyam@gmail.com";

  useEffect(() => {
    testConnection();
  }, []);

  useEffect(() => {
    if (user) {
      const unsubVideos = subscribeToVideos(user.uid, setVideos);
      const unsubImages = subscribeToImages(user.uid, setImages);
      const unsubPayments = subscribeToUserPayments(user.uid, setPayments);
      
      let unsubAllPayments: any;
      if (isAdmin) {
        unsubAllPayments = subscribeToAllPayments(setAllPayments);
      }

      return () => {
        unsubVideos();
        unsubImages();
        unsubPayments();
        if (unsubAllPayments) unsubAllPayments();
      };
    }
  }, [user, isAdmin]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!user) {
      toast.error("እባክዎን ለማመንጨት ይግቡ");
      return;
    }

    if (!prompt.trim()) {
      toast.error("እባክዎን መመሪያ ያስገቡ");
      return;
    }

    if (dbUser?.credits <= 0) {
      toast.error("በቂ ክሬዲት የለዎትም። እባክዎን ያሻሽሉ።");
      setActiveTab('billing');
      return;
    }

    setIsGenerating(true);
    
    try {
      if (genType === 'image') {
        const imageUrl = await generateImage(prompt);
        await saveImage(user.uid, prompt, imageUrl);
        await deductCredit(user.uid);
        toast.success("ምስል ተፈጥሯል!");
        setPrompt('');
      } else {
        const videoId = `vid_${Date.now()}`;
        await deductCredit(user.uid);
        await saveVideo(user.uid, prompt, videoId, selectedImage || undefined);
        toast.info("ማመንጨት ተጀምሯል! ጥቂት ደቂቃዎችን ሊወስድ ይችላል።");

        const operation = await generateVideo(prompt, selectedImage || undefined);
        
        // Polling logic
        let currentOperation = operation;
        while (!currentOperation.done) {
          await new Promise(resolve => setTimeout(resolve, 10000));
          currentOperation = await getVideosOperation(currentOperation);
        }

        const response = currentOperation.response;
        if (response && response.generatedVideos && response.generatedVideos.length > 0) {
          const videoUrl = response.generatedVideos[0].video.uri;
          await updateVideoStatus(videoId, 'completed', videoUrl);
          toast.success("ቪዲዮው በተሳካ ሁኔታ ተፈጥሯል!");
        } else {
          throw new Error("No video generated");
        }
        setPrompt('');
        setSelectedImage(null);
      }
    } catch (error: any) {
      console.error("Generation failed:", error);
      if (error.message?.includes("Requested entity was not found") || error.message?.includes("PERMISSION_DENIED")) {
        toast.error("የኤፒአይ ቁልፍ ችግር። እባክዎን ቁልፍ ይምረጡ።");
        setHasApiKey(false);
      } else {
        toast.error("ማመንጨት አልተሳካም። እባክዎን እንደገና ይሞክሩ።");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const initiatePayment = async (amount: number, type: 'credits' | 'single_video', videoId?: string) => {
    if (!user) return;
    const paymentId = await createPayment(user.uid, user.email!, amount, type, videoId);
    setPendingPaymentInfo({ amount, type, videoId });
    setPaymentModalOpen(true);
    toast.info("የክፍያ ጥያቄ ተፈጥሯል። እባክዎን መመሪያዎቹን ይከተሉ።");
  };

  const handleConfirmPayment = async (payment: any) => {
    if (!isAdmin) return;
    await confirmPayment(payment.id, payment.userId, payment.type, payment.amount, payment.videoId);
    toast.success("ክፍያ ተረጋግጧል!");
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 overflow-hidden relative">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 blur-[120px] rounded-full" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="z-10 text-center max-w-2xl"
        >
          <div className="flex items-center justify-center mb-6">
            <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
              <VideoIcon className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
            ኤዘር ኤአይ ስቱዲዮ
          </h1>
          <p className="text-xl text-slate-400 mb-10 leading-relaxed">
            ከጽሑፍ ወይም ከፎቶዎች ሲኒማቲክ ቪዲዮዎችን እና አስደናቂ ምስሎችን ይፍጠሩ።
            በጎግል ቀጣይ ትውልድ የኤአይ ሞዴሎች የተጎላበተ።
          </p>
          
          <Button 
            onClick={login}
            size="lg" 
            className="h-14 px-8 text-lg bg-white text-black hover:bg-slate-200 rounded-full transition-all"
          >
            በነጻ ይጀምሩ
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <header className="border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <VideoIcon className="w-6 h-6 text-blue-500" />
            <span className="font-bold text-xl tracking-tight text-white">ኤዘር ኤአይ</span>
          </div>
          
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setActiveTab('admin')}
                className={activeTab === 'admin' ? 'text-blue-400' : 'text-slate-400'}
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                አስተዳዳሪ
              </Button>
            )}
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-full border border-slate-800">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium">{dbUser?.credits || 0} ክሬዲቶች</span>
            </div>
            
            <Button variant="ghost" size="icon" onClick={logout} className="text-slate-400 hover:text-white">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="flex justify-center">
            <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-full">
              <TabsTrigger value="create" className="rounded-full px-6 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Sparkles className="w-4 h-4 mr-2" />
                ፍጠር
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-full px-6 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <History className="w-4 h-4 mr-2" />
                ታሪክ
              </TabsTrigger>
              <TabsTrigger value="billing" className="rounded-full px-6 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <CreditCard className="w-4 h-4 mr-2" />
                ዋጋ
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="create" className="mt-0">
            <div className="max-w-3xl mx-auto space-y-8">
              {!hasApiKey && (
                <Card className="bg-amber-600/10 border-amber-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2 text-amber-500">
                      <AlertCircle className="w-5 h-5" />
                      የኤፒአይ ቁልፍ ያስፈልጋል
                    </CardTitle>
                    <CardDescription className="text-amber-200/70">
                      ቪዲዮዎችን ለማመንጨት የራስዎን የGemini ኤፒአይ ቁልፍ መምረጥ አለብዎት።
                    </CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <div className="flex flex-col w-full gap-3">
                      <Button onClick={handleSelectKey} className="bg-amber-600 hover:bg-amber-500 text-white">
                        የኤፒአይ ቁልፍ ይምረጡ
                      </Button>
                      <a 
                        href="https://ai.google.dev/gemini-api/docs/billing" 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs text-amber-400/60 hover:text-amber-400 underline text-center"
                      >
                        ስለ ቢሊንግ (Billing) የበለጠ ይረዱ
                      </a>
                    </div>
                  </CardFooter>
                </Card>
              )}

              <div className="flex justify-center gap-4">
                <Button 
                  variant={genType === 'video' ? 'default' : 'outline'}
                  onClick={() => setGenType('video')}
                  className="rounded-full px-8"
                >
                  <VideoIcon className="w-4 h-4 mr-2" />
                  ቪዲዮ
                </Button>
                <Button 
                  variant={genType === 'image' ? 'default' : 'outline'}
                  onClick={() => setGenType('image')}
                  className="rounded-full px-8"
                >
                  <ImageIcon className="w-4 h-4 mr-2" />
                  ምስል
                </Button>
              </div>

              <Card className="bg-slate-900 border-slate-800 shadow-2xl">
                <CardContent className="pt-6 space-y-6">
                  {genType === 'video' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-400">ምንጭ ምስል (አማራጭ)</label>
                        {selectedImage && (
                          <Button variant="ghost" size="sm" onClick={() => setSelectedImage(null)} className="text-red-400 h-6">
                            <X className="w-3 h-3 mr-1" /> አስወግድ
                          </Button>
                        )}
                      </div>
                      
                      {selectedImage ? (
                        <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-800">
                          <img src={selectedImage} alt="Selected" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-800/50 transition-all"
                        >
                          <Upload className="w-8 h-8 text-slate-600" />
                          <span className="text-sm text-slate-500">ለቪዲዮ ምስል ለመጫን እዚህ ይጫኑ</span>
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            accept="image/*" 
                            className="hidden" 
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">
                      {genType === 'video' ? 'የቪዲዮ መመሪያ' : 'የምስል መመሪያ'}
                    </label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={genType === 'video' ? "ቪዲዮዎን ይግለጹ..." : "ምስልዎን ይግለጹ..."}
                      className="w-full min-h-[120px] bg-slate-950 border-slate-800 rounded-xl p-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-center pb-8">
                  <Button 
                    onClick={handleGenerate}
                    disabled={isGenerating || !prompt.trim()}
                    className="w-full md:w-auto px-12 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold transition-all shadow-lg shadow-blue-600/20"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        በማመንጨት ላይ...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        {genType === 'video' ? 'ቪዲዮ አመንጭ' : 'ምስል አመንጭ'}
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <div className="space-y-12">
              <section className="space-y-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <VideoIcon className="w-6 h-6 text-blue-500" />
                  ቪዲዮዎች
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {videos.map((video) => (
                    <Card key={video.id} className="bg-slate-900 border-slate-800 overflow-hidden">
                      <div className="aspect-video bg-slate-950 relative">
                        {video.status === 'completed' ? (
                          <video src={video.videoUrl} className="w-full h-full object-cover" controls />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                          </div>
                        )}
                      </div>
                      <CardHeader className="p-4">
                        <CardTitle className="text-sm line-clamp-1">{video.prompt}</CardTitle>
                      </CardHeader>
                      <CardFooter className="p-4 pt-0 flex justify-between items-center">
                        <Badge variant={video.isPaid ? "default" : "secondary"} className={video.isPaid ? "bg-emerald-600" : "bg-amber-600"}>
                          {video.isPaid ? "ተከፍሏል" : "አልተከፈለም"}
                        </Badge>
                        {video.status === 'completed' && (
                          video.isPaid ? (
                            <Button size="sm" variant="outline" asChild>
                              <a href={video.videoUrl} download target="_blank" rel="noreferrer">
                                <Download className="w-4 h-4 mr-2" /> አውርድ
                              </a>
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => initiatePayment(15, 'single_video', video.id)}>
                              <Lock className="w-4 h-4 mr-2" /> ክፈት (15 ብር)
                            </Button>
                          )
                        )}
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </section>

              <section className="space-y-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <ImageIcon className="w-6 h-6 text-purple-500" />
                  ምስሎች
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {images.map((image) => (
                    <div key={image.id} className="aspect-square rounded-xl overflow-hidden border border-slate-800 relative group">
                      <img src={image.imageUrl} alt={image.prompt} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center p-2">
                        <Button size="icon" variant="ghost" asChild>
                          <a href={image.imageUrl} download target="_blank" rel="noreferrer">
                            <Download className="w-4 h-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="billing" className="mt-0">
            <div className="max-w-3xl mx-auto space-y-8">
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold text-white">ክሬዲቶችን ይግዙ</h2>
                <p className="text-slate-400">1 ቪዲዮ = 1 ክሬዲት = 15 ብር</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[5, 10, 20].map((count) => (
                  <Card key={count} className="bg-slate-900 border-slate-800 hover:border-blue-500 transition-all cursor-pointer" onClick={() => initiatePayment(count * 15, 'credits')}>
                    <CardHeader className="text-center">
                      <CardTitle className="text-2xl">{count} ክሬዲቶች</CardTitle>
                      <CardDescription>{count * 15} ብር</CardDescription>
                    </CardHeader>
                    <CardFooter>
                      <Button className="w-full">አሁን ይግዙ</Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>

              <Card className="bg-blue-600/10 border-blue-500/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    የክፍያ መመሪያዎች
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2 text-slate-300">
                  <p>1. ጥቅል ይምረጡ ወይም አንድ ቪዲዮ ይክፈቱ።</p>
                  <p>2. ገንዘቡን ወደዚህ ያስተላልፉ፦ <strong>Telebirr: 09XXXXXXXX</strong> ወይም <strong>CBE: 1000XXXXXXXX</strong>።</p>
                  <p>3. አስተዳዳሪው ክፍያውን ካረጋገጠ በኋላ ክሬዲቶችዎ ይታከላሉ (ብዙውን ጊዜ በ30 ደቂቃ ውስጥ)።</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="admin" className="mt-0">
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-white">የአስተዳዳሪ ዳሽቦርድ - ክፍያዎች</h2>
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <ScrollArea className="h-[600px]">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-xs">
                        <tr>
                          <th className="p-4">ተጠቃሚ</th>
                          <th className="p-4">መጠን</th>
                          <th className="p-4">ዓይነት</th>
                          <th className="p-4">ሁኔታ</th>
                          <th className="p-4">ቀን</th>
                          <th className="p-4">ተግባር</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {allPayments.map((pay) => (
                          <tr key={pay.id} className="hover:bg-slate-800/30">
                            <td className="p-4">{pay.userEmail}</td>
                            <td className="p-4 font-bold">{pay.amount} ብር</td>
                            <td className="p-4 capitalize">{pay.type.replace('_', ' ')}</td>
                            <td className="p-4">
                              <Badge variant={pay.status === 'confirmed' ? 'default' : 'secondary'}>
                                {pay.status === 'confirmed' ? 'ተረጋግጧል' : 'በመጠባበቅ ላይ'}
                              </Badge>
                            </td>
                            <td className="p-4 text-slate-500">{new Date(pay.createdAt?.toDate()).toLocaleString()}</td>
                            <td className="p-4">
                              {pay.status === 'pending' && (
                                <Button size="sm" onClick={() => handleConfirmPayment(pay)}>
                                  አረጋግጥ
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* Payment Modal */}
      <AnimatePresence>
        {paymentModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">ክፍያውን ያጠናቅቁ</h3>
                <Button variant="ghost" size="icon" onClick={() => setPaymentModalOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              <div className="space-y-6">
                <div className="p-4 bg-blue-600/10 border border-blue-500/30 rounded-2xl text-center">
                  <span className="text-sm text-blue-400 block mb-1">የሚከፈልበት መጠን</span>
                  <span className="text-3xl font-bold text-white">{pendingPaymentInfo?.amount} ብር</span>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                    <p className="text-sm text-slate-400">በትክክል <strong>{pendingPaymentInfo?.amount} ብር</strong> ወደዚህ ያስተላልፉ፦</p>
                  </div>
                  <div className="ml-9 p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <p className="text-sm font-mono">Telebirr: 09XXXXXXXX</p>
                    <p className="text-sm font-mono">CBE: 1000XXXXXXXX</p>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                    <p className="text-sm text-slate-400">አስተዳዳሪው እስኪያረጋግጥ ይጠብቁ። {pendingPaymentInfo?.type === 'credits' ? 'ክሬዲቶችዎ' : 'ቪዲዮዎ'} በራስ-ሰር ይከፈታሉ።</p>
                  </div>
                </div>

                <Button className="w-full h-12 rounded-full bg-blue-600 hover:bg-blue-500" onClick={() => setPaymentModalOpen(false)}>
                  ከፍያለሁ
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
