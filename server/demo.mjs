import pptxgen from 'pptxgenjs';

export async function demoDeck() {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Inkstage';
  pptx.subject = 'A practice deck for presenting and annotating';
  pptx.title = 'Room to think';
  pptx.lang = 'en-US';
  const dark = '173E33', lime = 'D5F291', paper = 'F5F3EB';
  const add = (section, title, notes, background = paper) => {
    const s = pptx.addSlide(); s.background = { color: background };
    const light = background === dark;
    s.addText(`INKSTAGE   /   ${section}`, { x: .7, y: .5, w: 10, h: .35, fontFace: 'Aptos', fontSize: 12, color: light ? lime : dark, charSpacing: 2 });
    s.addText(title, { x: .7, y: 1.25, w: 11.7, h: 1.7, fontFace: 'Georgia', fontSize: 56, bold: false, breakLine: false, color: light ? paper : dark, margin: 0 });
    s.addText(`${pptx._slides.length.toString().padStart(2, '0')}   /   ROOM TO THINK`, { x: .7, y: 6.7, w: 9, h: .3, fontSize: 10, color: light ? 'ACC4B9' : '657A70', charSpacing: 1 });
    s.addNotes(notes);
    return s;
  };
  let s = add('A PRACTICE PRESENTATION', 'Good ideas need\nroom to think.', 'Welcome. Try drawing on this slide. Pause at the end of a stroke for half a second to straighten it. Your audience sees only the slide and ink.', dark);
  s.addText('A little space. A clear point. Your own handwriting.', { x: .74, y: 4.1, w: 10, h: .5, fontSize: 21, color: 'BBD1C5' });
  s.addText('Make your mark', { x: 8.9, y: 5.5, w: 3.3, h: .5, fontFace: 'Georgia', italic: true, fontSize: 23, color: lime });
  s = add('01  /  THE BIG IDEA', 'A slide starts\nthe conversation.', 'Underline “starts”, then add a thought in the open area. The tablet pen view gives you the whole slide to write on.');
  s.addText('Your explanation is what brings it to life.', { x: .75, y: 3.5, w: 10.8, h: .6, fontSize: 24, color: '657A70' });
  s = add('02  /  MAKE A CONNECTION', 'What happens next?', 'Draw a line between the two ideas. Hold at the endpoint to snap it straight. Try the highlighter, then use the eraser or your stylus button.');
  s.addText('An idea', { x: 1.4, y: 4.0, w: 3.4, h: .8, fontFace: 'Georgia', fontSize: 36, color: dark });
  s.addText('A possibility', { x: 8.3, y: 4.0, w: 4.0, h: .8, fontFace: 'Georgia', fontSize: 36, color: dark });
  s = add('03  /  TAKE IT WITH YOU', 'The conversation\nstays on the slide.', 'Export the annotated PowerPoint. Your original content stays editable, and each pen stroke becomes an editable freeform shape. Laser pointers are temporary and are not exported.', dark);
  s.addText('Present. Write. Keep the thinking.', { x: .75, y: 4.3, w: 10, h: .6, fontSize: 25, color: lime });
  return pptx.write({ outputType: 'nodebuffer' });
}
