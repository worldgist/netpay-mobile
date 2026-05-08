import { Loader2 } from "lucide-react";
import { useContentPage } from "@/hooks/useContentPage";
import { MarkdownContent } from "@/components/MarkdownContent";

const About = () => {
  const { content, loading, error } = useContentPage('about_us');

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-orange-600" />
          <p className="text-gray-600">Loading about page...</p>
        </div>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2 text-gray-900">About Us</h1>
          <p className="text-gray-600">{error || 'Content not available'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <section className="container mx-auto px-4 py-16 md:py-24 space-y-12">
        <div className="max-w-3xl space-y-6">
          <span className="text-brand font-semibold uppercase tracking-[0.35em] text-xs md:text-sm">
            Who We Are
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
            {content.title}
          </h1>
          {content.meta_description && (
            <p className="text-muted-foreground text-lg leading-relaxed">
              {content.meta_description}
            </p>
          )}
        </div>

        <div className="bg-card rounded-lg shadow-md p-8">
          <MarkdownContent content={content.content} />
        </div>

        <div className="bg-card rounded-lg shadow-md p-8 space-y-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">Founder &amp; CEO</h2>
              <p className="text-muted-foreground">
                Mustapha Suleiman — Founder &amp; Chief Executive Officer of Netpay Global Holdings Ltd.
              </p>
            </div>

            <div className="w-full md:w-[220px] shrink-0">
              <div className="rounded-xl border border-border/60 bg-background overflow-hidden shadow-sm">
                <img
                  src="/images/founder-mustapha-suleiman.png"
                  alt="Mustapha Suleiman, Founder & CEO of Netpay Global Holdings Ltd"
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 text-foreground/90 leading-relaxed">
            <p>
              Mustapha Suleiman is a Nigerian entrepreneur, fintech innovator, technology strategist, and
              business executive recognized as the Founder and Chief Executive Officer of Netpay Global
              Holdings Ltd, a diversified holding company with subsidiaries operating across fintech, digital
              technology, logistics, and real estate sectors. He is known for his vision of building
              technology-driven solutions that simplify digital payments, improve financial accessibility, and
              promote economic growth through entrepreneurship and digital transformation.
            </p>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-foreground">Early Life &amp; Background</h3>
              <p className="text-muted-foreground">
                Born on 26 February 2000 in Vandeikya Local Government Area of Benue State, Nigeria, to the
                family of Alhaji Suleiman Musa. He was raised with strong values of discipline, hard work,
                leadership, and education. He attended Jack and Jill Nursery and Primary School, Vandeikya
                (First School Leaving Certificate, 2011) and Saint Peter Secondary School, Vandeikya (SSCE,
                2017).
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-foreground">Education</h3>
              <p className="text-muted-foreground">
                In 2018, Suleiman gained admission into Kogi State University, Anyigba (now Prince Abubakar
                Audu University), where he studied Physics Education and graduated in 2022. Driven by a
                growing passion for technology, innovation, and digital systems, he further pursued an
                M.Sc. in Computer Science at Cross River University of Science and Technology, Calabar.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-foreground">Entrepreneurial Journey</h3>
              <p className="text-muted-foreground">
                During his university years, Mustapha Suleiman conceived the idea of creating a digital
                financial platform known as Netpay, aimed at simplifying bill payments and improving access
                to digital financial services for individuals and businesses. What began as a student-driven
                concept evolved into a broader business ecosystem focused on innovation, technology, and
                enterprise development, leading to the establishment of Netpay Global Holdings Ltd.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-xl font-semibold text-foreground">Business Ventures &amp; Subsidiaries</h3>
              <p className="text-muted-foreground">
                Netpay World Enterprise Ltd is a subsidiary company under Netpay Global Holdings Ltd, alongside
                other subsidiaries within the group.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-sm text-muted-foreground">
                      <th className="font-semibold pr-4">Subsidiary</th>
                      <th className="font-semibold">Area of Operation</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm md:text-base">
                    <tr>
                      <td className="pr-4 font-medium text-foreground">Netpay World Enterprise Ltd</td>
                      <td className="text-muted-foreground">Financial Services &amp; Enterprise Solutions</td>
                    </tr>
                    <tr>
                      <td className="pr-4 font-medium text-foreground">ChainCola Digital Service Ltd</td>
                      <td className="text-muted-foreground">Digital Technology &amp; Blockchain Innovation</td>
                    </tr>
                    <tr>
                      <td className="pr-4 font-medium text-foreground">Noble Edge Reality Estate Ltd</td>
                      <td className="text-muted-foreground">Real Estate &amp; Infrastructure Development</td>
                    </tr>
                    <tr>
                      <td className="pr-4 font-medium text-foreground">Netpay Logistics Services Ltd</td>
                      <td className="text-muted-foreground">Logistics, Delivery &amp; Transportation</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-foreground">Leadership &amp; Vision</h3>
              <p className="text-muted-foreground">
                Under his leadership, Netpay Global Holdings Ltd continues to pursue a mission of becoming
                one of Africa’s leading indigenous technology and enterprise brands. He promotes innovation,
                entrepreneurship, digital transformation, and youth empowerment, combining strategic
                thinking, technology-driven innovation, and long-term business development.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-foreground">Public Image &amp; Influence</h3>
              <p className="text-muted-foreground">
                Suleiman is regarded as one of the emerging young entrepreneurs in Nigeria’s technology and
                business ecosystem, inspiring many young Africans interested in entrepreneurship and
                technology. He is particularly known for advocating:
              </p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Financial inclusion through technology</li>
                <li>Youth-driven innovation and empowerment</li>
                <li>Indigenous African digital enterprises</li>
                <li>Sustainable business development</li>
                <li>Technology-enabled economic growth</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-foreground">Philosophy</h3>
              <blockquote className="border-l-4 border-brand pl-4 italic text-muted-foreground">
                “Technology should not only connect people, but also empower them economically and simplify
                everyday life.”
              </blockquote>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-foreground">Future Ambitions</h3>
              <p className="text-muted-foreground">
                Mustapha Suleiman has expressed long-term ambitions to transform Netpay Global Holdings Ltd
                into a globally recognized African conglomerate with influence across fintech, digital
                commerce, logistics, real estate, and emerging technologies, including:
              </p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Expanding Netpay services across Africa</li>
                <li>Developing advanced digital payment infrastructure</li>
                <li>Investing in blockchain and fintech innovation</li>
                <li>Supporting startup ecosystems and entrepreneurship</li>
                <li>Creating employment opportunities for African youths</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-foreground">Learn more</h3>
              <p className="text-muted-foreground">
                Visit the official websites to learn more about the companies within the group:
              </p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>
                  <a
                    href="https://netpayholdings.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand hover:underline"
                  >
                    netpayholdings.com
                  </a>
                </li>
                <li>
                  <a
                    href="https://chaincola.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand hover:underline"
                  >
                    chaincola.com
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
