import { Link } from 'react-router-dom';
import SectionHeading from '../../components/common/SectionHeading';
import Button from '../../components/ui/Button';
import { PRICING_PLANS } from '../../constants/pricingPlans';

function Pricing() {
  return (
    <section id="pricing" className="bg-slate-50/60 py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <SectionHeading
          eyebrow="Pricing"
          title="Start free. Upgrade when PromptStudio becomes part of your workflow."
          subtitle="Free gives you a real taste of the intelligence. Pro unlocks the reusable tools built for heavy users."
        />

        <div className="mt-14 grid gap-8 sm:grid-cols-2">
          {PRICING_PLANS.map((plan) => {
            const isPro = plan.id === 'pro';
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-3xl border p-8 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl sm:p-10 ${
                  plan.highlighted
                    ? 'border-blue-600 bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl'
                    : 'border-gray-100 bg-white'
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 right-8 rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-600 shadow">
                    Most Popular
                  </span>
                )}

                <h3 className={`text-lg font-bold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                  {plan.name}
                </h3>

                <div className="mt-4 flex items-baseline gap-2">
                  <span className={`text-4xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm font-medium ${plan.highlighted ? 'text-blue-100' : 'text-gray-500'}`}>
                    / {plan.period}
                  </span>
                </div>

                <p className={`mt-4 text-sm leading-relaxed ${plan.highlighted ? 'text-blue-100' : 'text-gray-600'}`}>
                  {plan.description}
                </p>

                <ul className="mt-8 flex-1 space-y-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <svg
                        className={`mt-0.5 h-5 w-5 flex-shrink-0 ${plan.highlighted ? 'text-white' : 'text-blue-600'}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className={`text-sm ${plan.highlighted ? 'text-blue-50' : 'text-gray-600'}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link to={isPro ? '/signup?plan=pro' : '/signup'} className="mt-10 block">
                  <Button
                    variant={plan.highlighted ? 'secondary' : 'primary'}
                    size="lg"
                    className={`w-full ${plan.highlighted ? 'bg-white text-blue-600 hover:bg-blue-50 border-none' : ''}`}
                  >
                    {isPro ? 'Get Started with Pro' : 'Start Free'}
                  </Button>
                </Link>

                {isPro && (
                  <p className="mt-3 text-center text-xs text-blue-100">
                    Secure checkout will be enabled when payments launch.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          No payment is collected yet. Your account remains on the free plan until Pro billing is launched.
        </p>
      </div>
    </section>
  );
}

export default Pricing;
