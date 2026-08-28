import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';

const useCases = [
  ['Product & lifestyle', 'Turn a reference product shot into a detailed scene, lighting, composition and styling prompt.'],
  ['AI photography', 'Capture subject, camera feel, lighting, mood and composition from a visual reference.'],
  ['Social content', 'Study a visual style you like and create a reusable prompt for your own content.'],
  ['Creative exploration', 'Start with an image instead of a blank prompt and experiment faster.'],
];

function ImageToPrompt() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Navbar />

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 text-center sm:pt-28">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">PromptStudio.ai · Reference Intelligence</p>
          <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">Turn a reference into a powerful AI prompt</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">Use an image when you want to create. Use Reference Coding when you want to build, recreate or improve an existing product.</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="/signup" className="rounded-xl bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">Try Image → Prompt</a>
            <a href="/reference-coding" className="rounded-xl border border-indigo-200 bg-indigo-50 px-6 py-3.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100">Try Reference Coding →</a>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto grid max-w-6xl gap-5 px-6 py-14 md:grid-cols-3">
            {[
              ['01', 'Show your reference', 'Start with an image, screenshot or existing product reference instead of a blank page.'],
              ['02', 'Explain your intention', 'Tell PromptStudio what you want to create, recreate, improve or change.'],
              ['03', 'Get the right prompt', 'Receive a structured prompt ready for your image or coding AI workflow.'],
            ].map(([number, title, body]) => (
              <article key={number} className="rounded-2xl border border-slate-200 bg-white p-7">
                <span className="text-sm font-bold text-indigo-600">{number}</span>
                <h2 className="mt-3 text-xl font-semibold">{title}</h2>
                <p className="mt-2 leading-7 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">Image → Prompt</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Your reference image already contains the idea.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">Instead of guessing how to describe composition, subject, lighting, style and atmosphere, use the visual reference as your starting point. PromptStudio turns that starting point into a prompt you can work with and refine.</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {useCases.map(([title, body]) => (
              <article key={title} className="rounded-2xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 leading-7 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-950 px-6 py-20 text-center text-white">
          <h2 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Building from an existing product?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-300">Try Reference Coding. Add screenshots, an application reference, documentation and your requirements — then get a coding-ready prompt.</p>
          <a href="/reference-coding" className="mt-8 inline-flex rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">Open Reference Coding</a>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default ImageToPrompt;
