import CustomerEstimatePage from "../../components/CustomerEstimatePage";

export default async function CompanyEstimatePage({
  params,
}) {
  const resolvedParams = await params;

  const slug = String(
    resolvedParams?.slug || ""
  )
    .trim()
    .toLowerCase();

  return (
    <CustomerEstimatePage
      companySlug={slug}
    />
  );
}
