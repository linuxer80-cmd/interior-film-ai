import SwiftUI

@main
struct FieldAssistantApp: App {
    var body: some Scene { WindowGroup { SamplesView() } }
}

struct Product: Decodable, Identifiable {
    let id: String
    let brand: String?
    let productCode: String?
    let productName: String?
    let category: String?
    let pattern: String?
    let imagePath: String?
    let aliases: [String]?
    enum CodingKeys: String, CodingKey {
        case id, brand, aliases
        case productCode = "product_code", productName = "product_name"
        case category = "category_key", pattern = "pattern_line", imagePath = "sample_image_path"
    }
    var imageURL: URL? {
        guard let path = imagePath, !path.isEmpty else { return nil }
        if let url = URL(string: path), url.scheme == "https" { return url }
        guard !path.hasPrefix("/"), !path.split(separator: "/").contains("..") else { return nil }
        return path.split(separator: "/").reduce(URL(string: "https://gxtvvzysuhexhpljpswj.supabase.co/storage/v1/object/public")!) { $0.appendingPathComponent(String($1)) }
    }
}
struct ProductResponse: Decodable { let success: Bool; let products: [Product] }

@MainActor
final class SamplesModel: ObservableObject {
    @Published var products: [Product] = []
    @Published var loading = false
    @Published var error: String?
    func load() async {
        guard !loading else { return }
        loading = true; error = nil
        defer { loading = false }
        do {
            let (data, response) = try await URLSession.shared.data(from: URL(string: "https://interior-film-ai.vercel.app/api/film-products")!)
            guard let response = response as? HTTPURLResponse, response.statusCode == 200, data.count <= 12 * 1024 * 1024 else { throw URLError(.badServerResponse) }
            let result = try JSONDecoder().decode(ProductResponse.self, from: data)
            guard result.success else { throw URLError(.badServerResponse) }
            products = result.products
        } catch { self.error = "샘플을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요." }
    }
    func matches(_ product: Product, query: String) -> Bool {
        let text = query.uppercased().replacingOccurrences(of: "현다", with: "현대")
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
        let makers: [(String, [String])] = [("현대", ["HYUNDAI", "현대", "BODAQ"]), ("영림", ["YOUNGLIM", "영림"]), ("LX", ["LX"]), ("KCC", ["KCC"]), ("삼성", ["SAMSUNG", "삼성"])]
        for (name, values) in makers where text.contains(name) {
            guard values.contains(where: { (product.brand ?? "").uppercased().contains($0) }) else { return false }
        }
        let categories: [(String, [String])] = [("우드", ["WOOD", "우드"]), ("솔리드", ["SOLID", "솔리드"]), ("스톤", ["STONE", "MARBLE", "스톤"]), ("메탈", ["METAL", "메탈"])]
        for (name, values) in categories where text.contains(name) {
            let category = ((product.category ?? "") + " " + (product.pattern ?? "")).uppercased()
            guard values.contains(where: { category.contains($0) }) else { return false }
        }
        let expression = try? NSRegularExpression(pattern: "(?i)(?<![A-Z0-9])[A-Z]{1,8}[- ]?[0-9][A-Z0-9-]*(?![A-Z0-9])")
        let range = NSRange(text.startIndex..., in: text)
        if let match = expression?.firstMatch(in: text, range: range), let found = Range(match.range, in: text) {
            let code = String(text[found]).replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "-", with: "")
            let variants = [product.productCode ?? ""] + (product.aliases ?? [])
            guard variants.contains(where: { $0.uppercased().replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "-", with: "").contains(code) }) else { return false }
        }
        return true
    }
}

struct SamplesView: View {
    @StateObject private var model = SamplesModel()
    @State private var query = ""
    @State private var count = 40
    var results: [Product] { model.products.filter { model.matches($0, query: query) } }
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("제조사, 제품번호나 무늬를 입력해 주세요.").font(.subheadline).foregroundStyle(.secondary)
                TextField("예: 현대 S115, 현대 우드", text: $query).textFieldStyle(.roundedBorder).onChange(of: query) { _ in count = 40 }
                if model.loading { ProgressView("샘플을 불러오고 있습니다") }
                if let error = model.error {
                    Text(error).foregroundStyle(.secondary)
                    Button("다시 시도") { Task { await model.load() } }
                } else if !model.loading {
                    Text("검색 결과 \(results.count)개").font(.caption).foregroundStyle(.secondary)
                    List {
                        ForEach(Array(results.prefix(count))) { product in
                            HStack(spacing: 12) {
                                AsyncImage(url: product.imageURL) { phase in
                                    if let image = phase.image { image.resizable().scaledToFill() }
                                    else { Color.gray.opacity(0.12) }
                                }.frame(width: 64, height: 64).clipped().cornerRadius(8)
                                VStack(alignment: .leading) {
                                    Text(product.productCode ?? "제품번호 없음").font(.headline)
                                    Text([product.brand, product.productName].compactMap { $0 }.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                                }
                            }
                        }
                        if count < results.count { Button("더 보기") { count += 40 } }
                    }.listStyle(.plain)
                }
            }.padding().navigationTitle("필름 샘플")
        }.task { if model.products.isEmpty { await model.load() } }
    }
}
