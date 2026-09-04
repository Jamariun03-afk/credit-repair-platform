import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BUREAU_DISPUTE_BODY = `{{date}}

{{client_name}}
{{client_address}}

{{bureau_name}}
{{bureau_address}}

RE: Request for Reinvestigation of Inaccurate Information

To Whom It May Concern:

I am writing to dispute the following information in my credit file. This item is inaccurate and I am requesting that it be investigated and corrected or removed.

Account Name: {{account_name}}
Account Number: {{account_number}}

Reason for Dispute: {{dispute_reason}}

{{supporting_facts}}

Under the Fair Credit Reporting Act, Section 611, you are required to investigate this matter and report back to me the results of your investigation. I am requesting the following action:

{{requested_action}}

Please send me an updated copy of my credit report reflecting the results of this investigation. I have enclosed copies of supporting documentation.

Sincerely,

{{client_name}}`;

const FURNISHER_DISPUTE_BODY = `{{date}}

{{client_name}}
{{client_address}}

{{bureau_name}}

RE: Direct Dispute of Inaccurate Furnished Information — {{account_name}}

To Whom It May Concern:

Pursuant to the Fair Credit Reporting Act, Section 623, I am directly disputing information your company has furnished to the consumer reporting agencies regarding the following account.

Account Name: {{account_name}}
Account Number: {{account_number}}

Reason for Dispute: {{dispute_reason}}

{{supporting_facts}}

I am requesting: {{requested_action}}

Please conduct a reasonable investigation and correct any inaccurate information furnished to the credit reporting agencies as a result.

Sincerely,

{{client_name}}`;

async function main() {
  const templates = [
    { name: "Experian Dispute — Standard", letterType: "EXPERIAN_DISPUTE", bodyTemplate: BUREAU_DISPUTE_BODY },
    { name: "Equifax Dispute — Standard", letterType: "EQUIFAX_DISPUTE", bodyTemplate: BUREAU_DISPUTE_BODY },
    { name: "TransUnion Dispute — Standard", letterType: "TRANSUNION_DISPUTE", bodyTemplate: BUREAU_DISPUTE_BODY },
    { name: "Furnisher Direct Dispute — Standard", letterType: "FURNISHER_DIRECT_DISPUTE", bodyTemplate: FURNISHER_DISPUTE_BODY },
  ] as const;

  for (const t of templates) {
    const existing = await prisma.templateDocument.findFirst({ where: { name: t.name } });
    if (existing) {
      console.log(`Template already exists: ${t.name}`);
      continue;
    }
    await prisma.templateDocument.create({
      data: {
        name: t.name,
        letterType: t.letterType,
        bodyTemplate: t.bodyTemplate,
        isActive: true,
      },
    });
    console.log(`Created template: ${t.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
