import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import Hero from './Hero';
import HowItWorks from './HowItWorks';
import Features from './Features';
import WorksWith from './WorksWith';
import ExampleGallery from './ExampleGallery';
import Pricing from './Pricing';

function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />
      <ExampleGallery />
      <WorksWith />
      <Pricing />
      <Footer />
    </div>
  );
}

export default Landing;
