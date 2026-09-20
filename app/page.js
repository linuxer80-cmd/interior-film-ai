import CustomerEstimatePage from "./components/CustomerEstimatePage";

export default function Home() {
  return (
    <CustomerEstimatePage
      companySlug="gibun"
      fallbackCompanyName="필름장이"
    />
  );
}
