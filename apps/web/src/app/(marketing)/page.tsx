import React from 'react';
import Link from 'next/link';
import { Heart, CheckCircle, Shield, Mic, MessageSquare, Lock, Mail, Sparkles } from 'lucide-react';

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Header */}
      <header className="px-6 py-6 md:px-12 lg:px-24 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="LegacyBridge Logo" className="w-10 h-10 object-contain" />
          <span className="font-bold text-navy text-xl tracking-tight">LegacyBridge</span>
        </div>
        
        <nav className="hidden md:flex items-center gap-8 text-navy font-medium opacity-80">
          <Link href="#features" className="hover:opacity-100 transition-opacity">Features</Link>
          <Link href="#families" className="hover:opacity-100 transition-opacity">For Families</Link>
        </nav>

        <Link 
          href="/login" 
          className="bg-terracotta text-white px-6 py-2.5 rounded-xl font-bold hover:bg-terracotta-hover transition-colors shadow-sm shadow-terracotta/20"
        >
          Sign In
        </Link>
      </header>

      <main>
        {/* Section 1 — Hero (above the fold) */}
        <section className="relative min-h-[calc(100vh-88px)] flex flex-col items-center justify-center px-6 text-center overflow-hidden">
          {/* Subtle green gradient at bottom edge */}
          <div className="absolute bottom-0 left-0 w-full h-1/4 bg-gradient-to-t from-[#E8EEEC]/40 to-transparent pointer-events-none" />
          
          <div className="max-w-4xl mx-auto space-y-8 relative z-10">
            <div className="inline-flex items-center gap-2 bg-[#F3E7E3] px-3 py-1.5 rounded-full border border-terracotta/10 mx-auto">
              <Shield className="w-4 h-4 text-terracotta" />
              <span className="text-[11px] font-bold text-terracotta uppercase tracking-wider">Secure Legacy Planning</span>
            </div>

            <h1 className="font-playfair text-5xl md:text-[56px] text-navy leading-tight font-black mx-auto max-w-[800px]">
              Give your family the <span className="text-terracotta italic">gift of knowing.</span>
            </h1>

            <p className="font-inter text-lg md:text-[20px] text-zinc-500 max-w-[640px] mx-auto leading-relaxed">
              A guided way for parents to share their stories, wishes, and everything their family needs — and for families to finally stop worrying.
            </p>

            <div className="flex flex-col items-center gap-4 pt-4">
              {/* Single CTA → /register ("How do you want to start?") which
                  routes the visitor into either path. Two-line label so the
                  button signals up-front that it handles both intents. */}
              <Link
                href="/register"
                className="bg-terracotta text-white font-bold px-12 py-4 rounded-xl shadow-xl shadow-terracotta/20 hover:scale-[1.02] transition-all active:scale-[0.98] flex flex-col items-center leading-tight"
              >
                <span className="text-lg">Start the gift</span>
                <span className="text-sm font-medium opacity-90">or set up for yourself</span>
              </Link>

              {/* "Look around" trial — sign-in only, lands them in a read-only
                  dashboard (subscriptionActive=false). Mirrors the same CTA on
                  /register so a returning marketing visitor can take the trial
                  path without going through the parent/self picker. */}
              <Link
                href="/register/auth?intent=trial"
                className="inline-flex items-center gap-2 text-navy font-medium opacity-70 hover:opacity-100 transition-opacity border-b border-navy/20 hover:border-navy/40"
              >
                <Sparkles className="w-4 h-4 text-gold" />
                Or start a free trial — just sign in and look around
              </Link>

              <p className="text-[12px] text-zinc-400 mt-2 italic">
                Your information stays private. Nothing is shared until you choose.
              </p>
            </div>
          </div>

          {/* Visual Elements - Floating relative to centered content */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-7xl h-full -z-10 pointer-events-none opacity-[0.4]">
             {/* Large un-intrusive background blurs */}
             <div className="absolute top-[10%] left-[10%] w-[400px] h-[400px] bg-terracotta/5 rounded-full blur-[100px]" />
             <div className="absolute bottom-[20%] right-[10%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
          </div>

          {/* Hands across generations visualization - subtle side elements */}
          <div className="hidden lg:block absolute left-24 top-1/2 -translate-y-1/2 w-48 h-64 bg-white rounded-3xl border-4 border-white shadow-2xl rotate-[-8deg] overflow-hidden group">
             <img src="/story-archive.png" alt="Story Archive" className="w-full h-full object-cover grayscale-[10%] group-hover:scale-110 transition-transform duration-1000" />
             <div className="absolute inset-0 bg-navy/5 group-hover:bg-transparent transition-colors" />
             <div className="absolute bottom-4 left-0 w-full text-center">
                <span className="text-white font-bold text-[10px] uppercase tracking-widest drop-shadow-md">Story Archive</span>
             </div>
          </div>
          <div className="hidden lg:block absolute right-24 top-1/2 -translate-y-1/2 w-80 aspect-[4/5] bg-white rounded-[40px] border-4 border-white shadow-2xl rotate-[6deg] overflow-hidden group">
             <img src="/hero-family.png" alt="Family Moment" className="w-full h-full object-cover grayscale-[10%] group-hover:scale-110 transition-transform duration-1000" />
             <div className="absolute inset-0 bg-navy/10 group-hover:bg-transparent transition-colors" />
          </div>
        </section>

        {/* Section 1.5 — Overview Video */}
        <section className="py-20 bg-background relative overflow-hidden">
          {/* Subtle decorative elements */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-20 bg-gradient-to-b from-zinc-200 to-transparent" />
          
          <div className="max-w-5xl mx-auto px-6">
            <div className="relative group">
              {/* Video Glow/Shadow */}
              <div className="absolute -inset-4 bg-primary/5 rounded-[48px] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="relative aspect-video rounded-[40px] overflow-hidden shadow-2xl border-[12px] border-white bg-white">
                <video 
                  src="/Legacy Bridge_ Gift it Forever_720p.mp4" 
                  controls 
                  className="w-full h-full object-cover"
                  poster="/hero-family.png"
                />
              </div>
            </div>
            
            <div className="text-center mt-8 space-y-2">
              <h3 className="font-playfair text-2xl text-navy font-bold">Watch how it works</h3>
              <p className="text-zinc-500 max-w-lg mx-auto text-sm">
                A brief overview of how LegacyBridge helps your family preserve what matters most.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2 — Two audience split */}
        <section id="families" className="py-24 px-6 md:px-12 lg:px-24 bg-white border-y border-zinc-100">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
            
            {/* Left card: Families */}
            <div className="bg-[#f2f6f4] p-10 md:p-14 rounded-[48px] border border-primary/5 flex flex-col justify-between group transition-all hover:shadow-lg hover:-translate-y-1 duration-500">
              <div className="space-y-6">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                   <Heart className="text-primary w-6 h-6" />
                </div>
                <h2 className="font-playfair text-3xl md:text-4xl text-navy mb-6">
                  For families who worry.
                </h2>
                <p className="font-inter text-zinc-600 text-lg leading-relaxed opacity-90 max-w-[440px]">
                  You love them. You've never quite had this conversation. You dread the day you'll be scrambling for account numbers and wishing you'd heard more of their stories.
                </p>
              </div>
              <div className="mt-12">
                <Link 
                  href="/register" 
                  className="font-bold text-primary group-hover:translate-x-1 transition-transform inline-flex items-center gap-2 group-hover:text-terracotta"
                >
                  Set this up for a parent <span className="text-xl">→</span>
                </Link>
              </div>
            </div>

            {/* Right card: Parents */}
            <div className="bg-white p-10 md:p-14 rounded-[48px] border border-zinc-100 flex flex-col justify-between group transition-all hover:shadow-lg hover:-translate-y-1 duration-500">
              <div className="space-y-6">
                <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center shadow-sm">
                   <Shield className="text-terracotta w-6 h-6" />
                </div>
                <h2 className="font-playfair text-3xl md:text-4xl text-navy mb-6">
                  For parents who care.
                </h2>
                <p className="font-inter text-zinc-600 text-lg leading-relaxed opacity-90 max-w-[440px]">
                  Your family needs more than what's in your will. They need your stories, your voice, your wishes — organized and waiting for them, on your terms.
                </p>
              </div>
              <div className="mt-12">
                <Link 
                  href="/register?path=parent" 
                  className="font-bold text-navy group-hover:translate-x-1 transition-transform inline-flex items-center gap-2 group-hover:text-terracotta"
                >
                  Start my own guide <span className="text-xl">→</span>
                </Link>
              </div>
            </div>

          </div>
        </section>

        {/* Section 3 — The scrambling moment (pain point) */}
        <section className="py-24 md:py-32 bg-primary text-white text-center px-6">
          <div className="max-w-[720px] mx-auto space-y-8">
            <h2 className="font-playfair text-4xl md:text-5xl font-black leading-tight">
              When something happens, families scramble.
            </h2>
            <p className="font-inter text-lg md:text-xl text-white/80 leading-relaxed">
              Finding accounts. Locating documents. Making decisions without knowing what their loved one would have wanted. 
              Most of that chaos is preventable — with one conversation that never happened. Until now.
            </p>
          </div>
        </section>

        {/* Section 4 — How it works (3 steps) */}
        <section id="works" className="py-24 md:py-32 px-6 md:px-12 lg:px-24 bg-background">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16 space-y-4">
              <h2 className="font-playfair text-4xl md:text-5xl text-navy font-black text-center">How it works</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
              {/* Step 1 */}
              <div className="bg-white p-8 md:p-10 rounded-3xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-14 h-14 bg-zinc-50 rounded-2xl flex items-center justify-center mb-8">
                  <MessageSquare className="text-gold w-7 h-7" />
                </div>
                <h3 className="font-playfair text-2xl text-navy font-bold mb-4">
                  Your parent shares their story.
                </h3>
                <p className="font-inter text-zinc-500 leading-relaxed">
                  A warm, guided conversation — at their own pace, in their own words. 
                  Their stories, wishes, and important information, captured the way they want.
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-white p-8 md:p-10 rounded-3xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-14 h-14 bg-zinc-50 rounded-2xl flex items-center justify-center mb-8">
                  <Lock className="text-gold w-7 h-7" />
                </div>
                <h3 className="font-playfair text-2xl text-navy font-bold mb-4">
                  It stays private until they're ready.
                </h3>
                <p className="font-inter text-zinc-500 leading-relaxed">
                  Everything is encrypted and secure. Your parent stays in control. 
                  They decide what's shared and when — nothing releases without their permission.
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-white p-8 md:p-10 rounded-3xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-14 h-14 bg-zinc-50 rounded-2xl flex items-center justify-center mb-8">
                  <Mail className="text-gold w-7 h-7" />
                </div>
                <h3 className="font-playfair text-2xl text-navy font-bold mb-4">
                  Your family has everything they need.
                </h3>
                <p className="font-inter text-zinc-500 leading-relaxed">
                  When the moment comes, the guide is there. The accounts, the wishes, the stories, the messages. 
                  Everything in one place. No scrambling.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5 — What's inside (tile preview) */}
        <section className="py-24 md:py-32 px-6 md:px-12 lg:px-24 bg-[#f2f6f4]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16 space-y-4">
              <h2 className="font-playfair text-4xl md:text-5xl text-navy font-black">
                Everything a family needs. Nothing they don't.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
              {/* Row 1: 3 cards */}
              {[
                { title: "My life story", desc: "Your words, your voice, your chapters." },
                { title: "Accounts and locations", desc: "Where to find everything that matters." },
                { title: "Health and medical", desc: "What your family needs in an emergency." }
              ].map((card) => (
                <div key={card.title} className="md:col-span-2 bg-white/60 backdrop-blur-sm p-8 rounded-3xl border border-primary/5 hover:bg-white transition-colors">
                  <h3 className="font-bold text-navy text-lg mb-2">{card.title}</h3>
                  <p className="text-zinc-600 text-sm leading-relaxed">{card.desc}</p>
                </div>
              ))}

              {/* Row 2: 3 cards */}
              {[
                { title: "Wills and trusts", desc: "Guidance and a place to keep what you've prepared." },
                { title: "Final wishes", desc: "Your service, your way." },
                { title: "Letters to loved ones", desc: "The things you most want them to know." }
              ].map((card) => (
                <div key={card.title} className="md:col-span-2 bg-white/60 backdrop-blur-sm p-8 rounded-3xl border border-primary/5 hover:bg-white transition-colors">
                  <h3 className="font-bold text-navy text-lg mb-2">{card.title}</h3>
                  <p className="text-zinc-600 text-sm leading-relaxed">{card.desc}</p>
                </div>
              ))}

              {/* Row 3: 1 card centered and wider */}
              <div className="md:col-start-2 md:col-span-4 bg-white/60 backdrop-blur-sm p-8 rounded-3xl border border-primary/5 hover:bg-white transition-colors text-center">
                <h3 className="font-bold text-navy text-lg mb-2">Special occasions</h3>
                <p className="text-zinc-600 text-sm leading-relaxed max-w-md mx-auto">
                  Your voice at the moments you'd most want to be there.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6 — Trust and control */}
        <section className="py-24 md:py-32 px-6 md:px-12 lg:px-24 bg-white">
          <div className="max-w-3xl mx-auto space-y-16">
            <h2 className="font-playfair text-4xl md:text-5xl text-navy font-black text-center">
              You're in control. Always.
            </h2>

            <div className="space-y-10">
              {[
                { 
                  title: "You decide what to share and when", 
                  desc: "Nothing is released without your permission. You have final word on every piece of information." 
                },
                { 
                  title: "Your information is encrypted", 
                  desc: "We cannot read it. Your family cannot access it until you allow it. Privacy is built in, not added on." 
                },
                { 
                  title: "You set the check-in schedule", 
                  desc: "A simple confirmation every few months keeps everything locked on your terms." 
                }
              ].map((point) => (
                <div key={point.title} className="flex gap-6">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                    <CheckCircle className="text-primary w-5 h-5" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-navy text-xl">{point.title}</h3>
                    <p className="text-zinc-500 leading-relaxed italic">{point.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 7 — Social proof placeholder */}
        <section className="py-24 md:py-32 px-6 md:px-12 lg:px-24 bg-background border-y border-zinc-100">
          <div className="max-w-7xl mx-auto">
            <h2 className="font-playfair text-4xl text-navy font-black text-center mb-16">
              What families are saying
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* TODO: replace with real testimonials from beta users */}
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 italic text-zinc-600 space-y-4">
                <p>"My dad finished his guide on a Tuesday. He passed away unexpectedly that Friday. I don't know how we would have gotten through that week without it."</p>
                <p className="font-bold text-navy not-italic">— Sarah M., daughter</p>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 italic text-zinc-600 space-y-4">
                <p>"I kept putting this off for years. It took me three sessions and now I feel like I've given my kids something real."</p>
                <p className="font-bold text-navy not-italic">— Robert K., father of two</p>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100 italic text-zinc-600 space-y-4">
                <p>"We used the guide to write my mom's obituary. It practically wrote itself. Everyone at the service asked how we did it."</p>
                <p className="font-bold text-navy not-italic">— Jennifer L., daughter</p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 8 — Final CTA */}
        <section className="py-32 px-6 bg-background">
          <div className="max-w-[600px] mx-auto text-center space-y-10">
            <h2 className="font-playfair text-4xl md:text-5xl text-navy font-black leading-tight">
              Give them the <span className="text-terracotta italic">gift of knowing.</span>
            </h2>
            <div className="flex flex-col items-center gap-6">
              <Link 
                href="/register" 
                className="bg-terracotta text-white font-bold text-xl px-16 py-6 rounded-2xl shadow-2xl shadow-terracotta/30 hover:scale-[1.02] transition-all active:scale-[0.98]"
              >
                Start the gift
              </Link>
              <p className="text-zinc-400 text-sm">
                No credit card required for initial setup.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 px-6 md:px-12 lg:px-24 border-t border-zinc-100 text-zinc-400 text-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="LegacyBridge" className="w-6 h-6 grayscale opacity-50" />
            <span className="font-bold text-navy/40">LegacyBridge</span>
          </div>
          <div className="flex gap-8">
            <Link href="/privacy" className="hover:text-navy transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-navy transition-colors">Terms of Service</Link>
            <span>&copy; {new Date().getFullYear()} LegacyBridge</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
