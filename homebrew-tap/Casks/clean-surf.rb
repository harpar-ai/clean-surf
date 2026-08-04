cask "clean-surf" do
  version "1.1.0"
  sha256 "7620c53b111e6bda4559b1e0c2d53750f926e77a118b08dfa586ffda998b3e35"

  url "https://github.com/harpar-ai/clean-surf/releases/download/v#{version}/Clean\\ Surf-#{version}-arm64.dmg"
  name "Clean Surf"
  desc "Privacy-first macOS browser — blocks ads, trackers, and cookie banners"
  homepage "https://github.com/harpar-ai/clean-surf"

  depends_on macos: ">= :monterey"
  depends_on arch: :arm64

  app "Clean Surf.app"

  # Remove quarantine so users don't get the "damaged" warning
  # (app is unsigned but safe — source available at homepage)
  disable_quarantine: true

  zap trash: [
    "~/Library/Application Support/Electron",
  ]
end
