import { Link } from 'react-router-dom';
import SectionHeading from '../../components/common/SectionHeading';
import Button from '../../components/ui/Button';
import { PRICING_PLANS } from '../../constants/pricingPlans';

function Pricing() {
  return (
    <section id="pricing" className="bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <SectionHeading
          eyebrow="Simple pricing"
          title="Start free. Pay when Image → Prompt becomes part of your workflow."
          subtitle="Try the core experience free, then choose one-time Creator Credits or Pro when you need more."
        />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PRICING_PLANS.map((plan) => {
            const isPro = plan.id === 'pro';
            const isCredits = plan.id === 'credits';
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-3xl border p-7 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl sm:p-8 ${
                  plan.highlighted
                    ? 'border-blue-600 bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl'
                    : isCredits
                      ? 'border-indigo-200 bg-white ring-1 ring-indigo-100'
                      : 'border-gray-100 bg-white'
                }`}
              >
                {plan.highlighted && <span className="absolute -top-3 right-6 rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-600 shadow">Most Popular</span>}
                {isCredits && <span className="absolute -top-3 right-6 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 shadow">Best for Image Creators</span>}

                <h3 className={`text-lg font-bold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                <div className="mt-4 flex items-baseline gap-2"><span className={`text-4xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>{plan.price}</span><span className={`text-sm font-medium ${plan.highlighted ? 'text-blue-100' : 'text-gray-500'}`}>/ {plan.period}</span></div>
                {isPro && <p className="mt-1 text-xs font-bold text-blue-100">or ₹499 / year</p>}
                {isCredits && <p className="mt-1 text-xs font-semibold text-indigo-600">₹99 gets 60 credits · Best Value</p>}
                <p className={`mt-4 min-h-14 text-sm leading-relaxed ${plan.highlighted ? 'text-blue-100' : 'text-gray-600'}`}>{plan.description}</p>

                <ul className="mt-7 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <svg className={`mt-0.5 h-5 w-5 flex-shrink-0 ${plan.highlighted ? 'text-white' : 'text-blue-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      <span className={`text-sm ${plan.highlighted ? 'text-blue-50' : 'text-gray-600'}`}>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link to="/signup" className="mt-9 block">
                  <Button variant={plan.highlighted ? 'secondary' : 'primary'} size="lg" className={`w-full ${plan.highlighted ? 'bg-white text-blue-600 hover:bg-blue-50 border-none' : ''}`}>
                    {isPro ? 'Start Pro' : isCredits ? 'Get Creator Credits' : 'Start Free'}
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">Secure checkout through Razorpay. Creator Credits never expire. No recurring payment for credit packs.</p>
      </div>
    </section>
  );
}

export default Pricing;
