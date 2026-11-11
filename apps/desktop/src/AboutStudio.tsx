import {
  identity,
  libraryCredits,
  methodCredits,
  anatomyCredit,
} from "../../../packages/branding";
export function AboutStudio() {
  return (
    <div className="about-studio">
      <header>
        <img
          src="./brand/app-icon.svg"
          alt="Acoustic source and receive array emblem"
        />
        <div>
          <h2>{identity.title}</h2>
          <p>Version {identity.version} · Passive acoustic mapping</p>
        </div>
      </header>
      <div className="research-credit">
        <strong>{identity.researcher}</strong>
        <span>
          {identity.project} · {identity.discipline}
        </span>
        <span>{identity.institution}</span>
      </div>
      <h3>Scientific libraries</h3>
      {libraryCredits.map((c) => (
        <section key={c.name}>
          <h4>
            {c.name} {c.version} <small>{c.license}</small>
          </h4>
          <p>{c.role}</p>
          <p>{c.authors}</p>
          <code>{c.reference}</code>
        </section>
      ))}
      <h3>{anatomyCredit.title}</h3>
      <section>
        <p>{anatomyCredit.authors}</p>
        <code>{anatomyCredit.reference}</code>
        <p>
          {anatomyCredit.license}. {anatomyCredit.modifications}
        </p>
      </section>
      <h3>Method references</h3>
      {methodCredits.map((c) => (
        <section key={c.name}>
          <h4>{c.name}</h4>
          <p>{c.authors}</p>
          <code>{c.reference}</code>
        </section>
      ))}
      <p className="property-note">
        Original library authorship and scientific method references are
        separate from development of this MRes workbench. Methods implemented
        here are reference or experimental variants; citations do not imply
        author endorsement or independent validation.
      </p>
      <p className="property-note">
        Numerical foundations: NumPy (Harris et al., 2020), SciPy (Virtanen et
        al., 2020), JAX/JaxDF and Diffrax/Equinox contributors. Desktop:
        Electron, React, Vite, TypeScript and Lucide contributors. Full method
        bibliography and relevant simulator references accompany experiment
        exports; dependency notices are retained in the project documentation.
      </p>
    </div>
  );
}
