import CustomerHomepage from "../../components/CustomerHomepage";

export const dynamic = "force-dynamic";

export default async function CompanyEstimatePage({ params }) {
  const { slug = "" } = await params;

  return (
    <CustomerHomepage
      slug={String(slug).trim().toLowerCase()}
    />
  );
}
