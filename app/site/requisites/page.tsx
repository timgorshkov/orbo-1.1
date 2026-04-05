import { Header, Footer } from '@/components/website';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Реквизиты — Orbo',
  description: 'Юридические реквизиты ООО «ОРБО»',
};

export default function RequisitesPage() {
  return (
    <>
      <Header transparent={false} />

      <main className="website-section" style={{ paddingTop: '120px' }}>
        <div className="website-container">
          <article className="terms-content">

            <h1>Реквизиты</h1>

            <div className="terms-requisites" style={{ marginTop: '2rem' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '600px' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px 16px 8px 0', color: '#6b7280', whiteSpace: 'nowrap', verticalAlign: 'top' }}>Полное наименование</td>
                    <td style={{ padding: '8px 0', fontWeight: 500 }}>ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ &laquo;ОРБО&raquo;</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 16px 8px 0', color: '#6b7280', whiteSpace: 'nowrap', verticalAlign: 'top' }}>Краткое наименование</td>
                    <td style={{ padding: '8px 0', fontWeight: 500 }}>ООО &laquo;ОРБО&raquo;</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 16px 8px 0', color: '#6b7280', whiteSpace: 'nowrap' }}>ИНН</td>
                    <td style={{ padding: '8px 0' }}>9701327025</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 16px 8px 0', color: '#6b7280', whiteSpace: 'nowrap' }}>КПП</td>
                    <td style={{ padding: '8px 0' }}>770101001</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 16px 8px 0', color: '#6b7280', whiteSpace: 'nowrap' }}>ОГРН</td>
                    <td style={{ padding: '8px 0' }}>1267700119037</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 16px 8px 0', color: '#6b7280', whiteSpace: 'nowrap', verticalAlign: 'top' }}>Юридический адрес</td>
                    <td style={{ padding: '8px 0' }}>105094, г.&nbsp;Москва, вн.тер.г. муниципальный округ Басманный, ул.&nbsp;Госпитальный Вал, д.&nbsp;3 к.&nbsp;4, кв.&nbsp;79</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 16px 8px 0', color: '#6b7280', whiteSpace: 'nowrap', verticalAlign: 'top' }}>Генеральный директор</td>
                    <td style={{ padding: '8px 0' }}>Горшков Тимофей Юрьевич</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 16px 8px 0', color: '#6b7280', whiteSpace: 'nowrap' }}>Расчётный счёт</td>
                    <td style={{ padding: '8px 0' }}>40702810110002081803</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 16px 8px 0', color: '#6b7280', whiteSpace: 'nowrap' }}>Банк</td>
                    <td style={{ padding: '8px 0' }}>АО «ТБанк»</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 16px 8px 0', color: '#6b7280', whiteSpace: 'nowrap' }}>ИНН банка</td>
                    <td style={{ padding: '8px 0' }}>7710140679</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 16px 8px 0', color: '#6b7280', whiteSpace: 'nowrap' }}>БИК банка</td>
                    <td style={{ padding: '8px 0' }}>044525974</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 16px 8px 0', color: '#6b7280', whiteSpace: 'nowrap' }}>Корр. счёт банка</td>
                    <td style={{ padding: '8px 0' }}>30101810145250000974</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p style={{ marginTop: '2.5rem', color: '#6b7280', fontSize: '0.9rem' }}>
              По вопросам сотрудничества и документооборота: <a href="mailto:hello@orbo.ru">hello@orbo.ru</a>
            </p>

          </article>
        </div>
      </main>

      <Footer />
    </>
  );
}
