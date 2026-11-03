import { describe, expect, it } from "vitest";
import { evaluar, clasificarUbicacion, parsearHoras, detectarTipo, aniosExperiencia, CONFIG_POR_DEFECTO as cfg } from "@/lib/filtros/motor";

const base = { empresa: "ACME" };

describe("remoto total", () => {
  it("acepta remoto sin país", () => {
    const r = evaluar({ ...base, puesto: "Junior Penetration Tester", ubicacion: "Remote" });
    expect(r.pasa).toBe(true);
    expect(r.area).toBe("Ofensiva");
    expect(r.prioridad).toBe(1);
  });
  it("descarta híbrido y presencial", () => {
    expect(evaluar({ ...base, puesto: "SOC Analyst", ubicacion: "Hybrid - Madrid" }).pasa).toBe(false);
    expect(evaluar({ ...base, puesto: "SOC Analyst", ubicacion: "On-site, Austin TX" }).pasa).toBe(false);
    expect(evaluar({ ...base, puesto: "SOC Analyst (Onsite)", ubicacion: "Remote" }).pasa).toBe(false);
  });
  it("descarta si no indica remoto", () => {
    const r = evaluar({ ...base, puesto: "SOC Analyst", ubicacion: "Seattle, WA" });
    expect(r.pasa).toBe(false);
    expect(r.motivo).toMatch(/remota/);
  });
  it("respeta la bandera remoto=false de la fuente", () => {
    expect(evaluar({ ...base, puesto: "SOC Analyst", ubicacion: "Remote", remoto: false }).pasa).toBe(false);
  });
});

describe("ubicación y residencia", () => {
  it("acepta México, LATAM, worldwide y anywhere", () => {
    for (const u of ["Remote - Mexico", "Remote (LATAM)", "Worldwide", "Anywhere in the world", "Remote, Latin America"]) {
      expect(evaluar({ ...base, puesto: "Security Analyst", ubicacion: u }).pasa, u).toBe(true);
    }
  });
  it("descarta EE. UU., Reino Unido y otros países", () => {
    expect(evaluar({ ...base, puesto: "Security Analyst", ubicacion: "Remote in USA" }).motivo).toMatch(/EE\. UU\./);
    expect(evaluar({ ...base, puesto: "Security Analyst", ubicacion: "Remote, United States" }).pasa).toBe(false);
    expect(evaluar({ ...base, puesto: "Security Analyst", ubicacion: "Remote - UK" }).motivo).toMatch(/Reino Unido/);
    expect(evaluar({ ...base, puesto: "Security Analyst", ubicacion: "Remote in Canada" }).pasa).toBe(false);
  });
  it("acepta si alguna de varias ubicaciones es válida", () => {
    expect(evaluar({ ...base, puesto: "Backend Engineer", ubicacion: "Remote in USA; Remote - Mexico" }).pasa).toBe(true);
  });
  it("Europa pasa con aviso (sueldo e inicio inmediato)", () => {
    const r = evaluar({ ...base, puesto: "Security Engineer", ubicacion: "Remote - Europe" });
    expect(r.pasa).toBe(true);
    expect(r.region).toBe("Europa");
    expect(r.avisos.join(" ")).toMatch(/inmediato/);
  });
  it("descarta residencia, permiso de trabajo, clearance y ciudadanía", () => {
    const t = (descripcion: string) => evaluar({ ...base, puesto: "SOC Analyst", ubicacion: "Remote", descripcion });
    expect(t("Candidates must reside in the US.").motivo).toMatch(/residencia/);
    expect(t("EU residents only").pasa).toBe(false);
    expect(t("You must be legally authorized to work in the United States").motivo).toMatch(/permiso/);
    expect(t("Active Secret clearance required").motivo).toMatch(/clearance/);
    expect(t("Must be a U.S. citizen").motivo).toMatch(/ciudadan/);
  });
  it("contratista o EOR rescata una ubicación restringida, con aviso", () => {
    const r = evaluar({ ...base, puesto: "DevOps Engineer", ubicacion: "Remote - Canada", descripcion: "Hired as independent contractor" });
    expect(r.pasa).toBe(true);
    expect(r.avisos[0]).toMatch(/contractor/);
  });
  it("clasifica ubicaciones", () => {
    expect(clasificarUbicacion("Remote", cfg)).toBe("Remoto sin especificar");
    expect(clasificarUbicacion("Remote - CDMX", cfg)).toBe("México");
    expect(clasificarUbicacion("Remote, Austin, TX", cfg)).toBe("EE. UU.");
    expect(clasificarUbicacion("Remote in Germany", cfg)).toBe("Europa");
    expect(clasificarUbicacion("Remote - California (USA), New Mexico (USA)", cfg)).toBe("EE. UU.");
    expect(clasificarUbicacion("Remote - North America, Latin America, Mexico", cfg)).toBe("México");
  });
});

describe("palabras clave, exclusiones y prácticas", () => {
  it("asigna área por prioridad ofensiva > defensiva > software", () => {
    expect(evaluar({ ...base, puesto: "Red Team Operator", ubicacion: "Remote" }).area).toBe("Ofensiva");
    expect(evaluar({ ...base, puesto: "Incident Response Analyst", ubicacion: "Remote" }).area).toBe("Defensiva");
    expect(evaluar({ ...base, puesto: "Backend Engineer (Python)", ubicacion: "Remote" }).area).toBe("Software");
  });
  it("las palabras de nivel solas no bastan", () => {
    expect(evaluar({ ...base, puesto: "Junior Accountant", ubicacion: "Remote" }).pasa).toBe(false);
  });
  it("excluye UI/UX, diseño y ventas", () => {
    expect(evaluar({ ...base, puesto: "UI/UX Designer", ubicacion: "Remote" }).pasa).toBe(false);
    expect(evaluar({ ...base, puesto: "Product Designer, Security", ubicacion: "Remote" }).pasa).toBe(false);
    expect(evaluar({ ...base, puesto: "Security Sales Engineer", ubicacion: "Remote" }).pasa).toBe(false);
    expect(evaluar({ ...base, puesto: "Salesforce Backend Developer", ubicacion: "Remote" }).pasa).toBe(true);
  });
  it("prácticas: máximo 6 horas por día", () => {
    expect(evaluar({ ...base, puesto: "Security Intern", ubicacion: "Remote", descripcion: "40 hours per week" }).pasa).toBe(false);
    expect(evaluar({ ...base, puesto: "Pentest Intern", ubicacion: "Remote", descripcion: "20 hours/week" }).pasa).toBe(true);
    const sinHoras = evaluar({ ...base, puesto: "Pentest Intern", ubicacion: "Remote" });
    expect(sinHoras.pasa).toBe(true);
    expect(sinHoras.avisos.join(" ")).toMatch(/6 h/);
  });
  it("detecta tipo y horas", () => {
    expect(detectarTipo("Cybersecurity Intern")).toBe("Prácticas");
    expect(detectarTipo("Security Consultant (Contract)")).toBe("Contrato");
    expect(detectarTipo("SOC Analyst")).toBe("Tiempo completo");
    expect(parsearHoras("Part time, 4 hours per day")).toBe(4);
    expect(parsearHoras("30 horas por semana")).toBe(6);
  });
  it("marcas de listas de GitHub", () => {
    expect(evaluar({ ...base, puesto: "Security Intern", ubicacion: "Remote", marcas: { cerrada: true } }).motivo).toMatch(/🔒/);
    expect(evaluar({ ...base, puesto: "Security Intern", ubicacion: "Remote", marcas: { ciudadania: true } }).motivo).toMatch(/🇺🇸/);
    const r = evaluar({ ...base, puesto: "Security Intern", ubicacion: "Remote in USA", marcas: { sinPatrocinio: true } });
    expect(r.motivo).toMatch(/🛂/);
  });
});

describe("solo nivel de entrada", () => {
  const t = (puesto: string, extra: { descripcion?: string; nivel?: string } = {}) => evaluar({ empresa: "ACME", puesto, ubicacion: "Remote", ...extra });
  it("descarta senior, staff, lead, manager, principal, architect", () => {
    for (const p of ["Senior Penetration Tester", "Sr. SOC Analyst", "Staff Security Engineer", "Lead Red Team Operator", "Security Engineering Manager", "Principal Application Security Engineer", "Security Architect", "Head of Security", "Director, Incident Response"]) {
      expect(t(p).pasa, p).toBe(false);
      expect(t(p).motivo, p).toMatch(/nivel de entrada/);
    }
  });
  it("descarta niveles II/III salvo que también diga I o Junior", () => {
    expect(t("Security Analyst II").motivo).toMatch(/intermedio/);
    expect(t("Software Engineer III").pasa).toBe(false);
    expect(t("Backend Engineer 2").pasa).toBe(false);
    expect(t("SOC Analyst I/II").pasa).toBe(true);
    expect(t("SOC Analyst I").pasa).toBe(true);
    expect(t("Tier 1 SOC Analyst").pasa).toBe(true);
  });
  it("conserva puestos de entrada y sin nivel", () => {
    for (const p of ["Junior Pentester", "Associate Security Consultant", "Security Analyst", "Vulnerability Management Analyst", "Cybersecurity Intern", "Graduate Software Engineer"]) {
      expect(t(p).pasa, p).toBe(true);
    }
  });
  it("usa el nivel que reporta la fuente", () => {
    expect(t("Penetration Tester", { nivel: "Senior (5-10 years)" }).pasa).toBe(false);
    expect(t("Penetration Tester", { nivel: "Mid-level (2-5 years)" }).pasa).toBe(false);
    expect(t("Penetration Tester", { nivel: "Semi Senior" }).pasa).toBe(false);
    expect(t("Penetration Tester", { nivel: "Junior (1-2 years)" }).pasa).toBe(true);
    expect(t("Penetration Tester", { nivel: "Entry level / Graduate" }).pasa).toBe(true);
  });
  it("descarta si pide 3 o más años de experiencia", () => {
    expect(t("Penetration Tester", { descripcion: "Requirements: 5+ years of experience in offensive security." }).motivo).toMatch(/5\+ años/);
    expect(t("SOC Analyst", { descripcion: "3-5 years of relevant work experience" }).pasa).toBe(false);
    expect(t("SOC Analyst", { descripcion: "Minimum 4 years in a SOC" }).pasa).toBe(false);
    expect(t("Backend Engineer", { descripcion: "Mínimo 3 años de experiencia con Python" }).pasa).toBe(false);
    expect(t("SOC Analyst", { descripcion: "1-2 years of experience or relevant internships" }).pasa).toBe(true);
    expect(t("SOC Analyst", { descripcion: "We have been in business for 20 years." }).pasa).toBe(true);
  });
  it("detecta años de experiencia", () => {
    expect(aniosExperiencia("2+ years experience with Python and 4+ years of professional software experience")).toBe(4);
    expect(aniosExperiencia("No experience required")).toBeNull();
  });
});
