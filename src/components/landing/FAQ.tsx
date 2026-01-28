import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const faqs = [
  {
    question: "É realmente gratuito?",
    answer:
      "Sim! Todas as funcionalidades são gratuitas, sem limites ou planos pagos.",
  },
  {
    question: "Quais bancos são suportados?",
    answer:
      "Atualmente suportamos importação de extratos CSV do C6, Itaú e BTG. Mais bancos em breve.",
  },
  {
    question: "Posso usar no celular?",
    answer:
      "O app é otimizado para desktop, mas funciona em navegadores mobile também.",
  },
  {
    question: "Como funciona a categorização automática?",
    answer:
      'Você cria regras baseadas em palavras-chave. Por exemplo: toda transação com "NETFLIX" vai automaticamente para "Streaming".',
  },
]

export function FAQ() {
  return (
    <section id="faq" className="bg-white py-24">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Perguntas Frequentes
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Tire suas dúvidas sobre o Finanças
          </p>
        </div>

        <Accordion type="single" collapsible className="mt-12">
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger className="text-left text-base font-medium text-gray-900">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
