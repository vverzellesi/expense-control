import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { LandingNav } from "./LandingNav"

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

describe("LandingNav", () => {
  describe("desktop navigation", () => {
    it("renders desktop nav links", () => {
      render(<LandingNav />)

      const recursosLinks = screen.getAllByText("Recursos")
      expect(recursosLinks.length).toBeGreaterThanOrEqual(1)

      const comoFuncionaLinks = screen.getAllByText("Como Funciona")
      expect(comoFuncionaLinks.length).toBeGreaterThanOrEqual(1)

      const faqLinks = screen.getAllByText("FAQ")
      expect(faqLinks.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("mobile navigation", () => {
    it("renders a hamburger menu button", () => {
      render(<LandingNav />)

      const menuButton = screen.getByRole("button", { name: /menu/i })
      expect(menuButton).toBeInTheDocument()
    })

    it("does not show mobile menu by default", () => {
      render(<LandingNav />)

      const mobileNav = screen.queryByTestId("mobile-menu")
      expect(mobileNav).not.toBeInTheDocument()
    })

    it("opens mobile menu when hamburger is clicked", () => {
      render(<LandingNav />)

      const menuButton = screen.getByRole("button", { name: /menu/i })
      fireEvent.click(menuButton)

      const mobileNav = screen.getByTestId("mobile-menu")
      expect(mobileNav).toBeInTheDocument()

      expect(screen.getAllByText("Recursos").length).toBeGreaterThanOrEqual(2)
      expect(screen.getAllByText("Como Funciona").length).toBeGreaterThanOrEqual(2)
      expect(screen.getAllByText("FAQ").length).toBeGreaterThanOrEqual(2)
    })

    it("closes mobile menu when a nav link is clicked", () => {
      render(<LandingNav />)

      const menuButton = screen.getByRole("button", { name: /menu/i })
      fireEvent.click(menuButton)

      const mobileNav = screen.getByTestId("mobile-menu")
      expect(mobileNav).toBeInTheDocument()

      const mobileLinks = mobileNav.querySelectorAll("a[href='#recursos']")
      expect(mobileLinks.length).toBe(1)
      fireEvent.click(mobileLinks[0])

      expect(screen.queryByTestId("mobile-menu")).not.toBeInTheDocument()
    })

    it("closes mobile menu when hamburger is clicked again", () => {
      render(<LandingNav />)

      const menuButton = screen.getByRole("button", { name: /menu/i })
      fireEvent.click(menuButton)
      expect(screen.getByTestId("mobile-menu")).toBeInTheDocument()

      fireEvent.click(menuButton)
      expect(screen.queryByTestId("mobile-menu")).not.toBeInTheDocument()
    })

    it("shows auth actions in mobile menu", () => {
      render(<LandingNav />)

      const menuButton = screen.getByRole("button", { name: /menu/i })
      fireEvent.click(menuButton)

      const mobileNav = screen.getByTestId("mobile-menu")
      const mobileLinks = mobileNav.querySelectorAll("a")
      const hrefs = Array.from(mobileLinks).map((l) => l.getAttribute("href"))

      // Session is mocked as authenticated, so dashboard link should be present
      expect(hrefs).toContain("/dashboard")
    })
  })
})
